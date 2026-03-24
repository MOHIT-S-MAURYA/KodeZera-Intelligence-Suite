const BASE = "http://localhost:8000/api/v1";

async function request(
  path,
  { method = "GET", token, json, form, retries = 5 } = {},
) {
  const headers = {};
  let body;

  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (form) body = form;

  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(data?.extensions?.retry_after_seconds ?? 2);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return request(path, { method, token, json, form, retries: retries - 1 });
  }

  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

async function login(email, password) {
  return request("/auth/login/", {
    method: "POST",
    json: { email, password },
  });
}

async function ensureDepartment(name, token) {
  const all = normalizeList(await request("/departments/", { token }));
  const existing = all.find((x) => x.name === name);
  if (existing) return existing;

  return request("/departments/", {
    method: "POST",
    token,
    json: { name, description: `${name} ACL test department` },
  });
}

async function ensureRole(name, token) {
  const all = normalizeList(await request("/roles/", { token }));
  const existing = all.find((x) => x.name === name);
  if (existing) return existing;

  return request("/roles/", {
    method: "POST",
    token,
    json: { name, description: `${name} ACL test role` },
  });
}

async function ensureUser(payload, token) {
  const users = normalizeList(await request("/users/", { token }));
  const existing = users.find(
    (x) => x.email.toLowerCase() === payload.email.toLowerCase(),
  );

  if (!existing) {
    return request("/users/", {
      method: "POST",
      token,
      json: payload,
    });
  }

  return request(`/users/${existing.id}/`, {
    method: "PATCH",
    token,
    json: {
      department: payload.department,
      role_id: payload.role_id,
      is_active: true,
    },
  });
}

async function ensureOrgMembership(userId, orgUnitId, token) {
  const current = normalizeList(
    await request(`/users/${userId}/org-units/`, { token }),
  );
  const exists = current.some(
    (r) =>
      r.org_unit === orgUnitId ||
      r.org_unit_id === orgUnitId ||
      r.org_unit?.id === orgUnitId,
  );

  if (!exists) {
    await request(`/org-units/${orgUnitId}/members/`, {
      method: "POST",
      token,
      json: { user: userId, membership_type: "member" },
    });
  }
}

async function uploadRestrictedDoc(title, text, token) {
  const form = new FormData();
  form.append("title", title);
  form.append("visibility_type", "restricted");
  form.append(
    "file",
    new Blob([text], { type: "text/plain" }),
    `${title.replace(/\s+/g, "_")}.txt`,
  );

  return request("/documents/upload/", {
    method: "POST",
    token,
    form,
  });
}

async function waitForProcessed(docId, token) {
  const maxPolls = 45;
  for (let i = 0; i < maxPolls; i += 1) {
    const doc = await request(`/documents/${docId}/`, { token });
    if (doc.status === "completed" || doc.status === "failed") {
      return doc;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return request(`/documents/${docId}/`, { token });
}

async function createGrant(docId, payload, token) {
  return request(`/document-access/`, {
    method: "POST",
    token,
    json: { document: docId, ...payload },
  });
}

async function ragQuery(question, token) {
  const res = await fetch(`${BASE}/rag/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, session_id: null }),
  });

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: raw.slice(0, 1000) };
  }

  let sources = [];
  let answer = "";

  for (const part of raw.split("\n\n")) {
    if (!part.startsWith("data: ")) continue;
    const payload = part.slice(6).trim();
    if (!payload) continue;

    try {
      const data = JSON.parse(payload);
      if (Array.isArray(data.sources)) sources = data.sources;
      if (typeof data.chunk === "string") answer += data.chunk;
      if (data.error) {
        return { ok: false, status: 200, error: data.error };
      }
    } catch {
      // Ignore malformed stream chunks
    }
  }

  return { ok: true, sources, answer };
}

(async () => {
  const suffix = String(Date.now()).slice(-6);
  const testPassword = "TestPass123!";

  const admin = await login("admin@acmecorp.com", "admin123");
  const adminToken = admin.access;

  const financeDept = await ensureDepartment(`Finance-${suffix}`, adminToken);
  const hrDept = await ensureDepartment(`HR-${suffix}`, adminToken);
  const financeRole = await ensureRole(`FinanceRole-${suffix}`, adminToken);
  const hrRole = await ensureRole(`HRRole-${suffix}`, adminToken);

  const financeUser = await ensureUser(
    {
      first_name: "Finance",
      last_name: "User",
      email: `finance.${suffix}@demo.local`,
      password: testPassword,
      department: financeDept.id,
      role_id: financeRole.id,
    },
    adminToken,
  );

  const hrUser = await ensureUser(
    {
      first_name: "HR",
      last_name: "User",
      email: `hr.${suffix}@demo.local`,
      password: testPassword,
      department: hrDept.id,
      role_id: hrRole.id,
    },
    adminToken,
  );

  const directUser = await ensureUser(
    {
      first_name: "Direct",
      last_name: "User",
      email: `direct.${suffix}@demo.local`,
      password: testPassword,
      department: hrDept.id,
      role_id: null,
    },
    adminToken,
  );

  const financeRoleDoc = await uploadRestrictedDoc(
    `FinanceRoleSecret-${suffix}`,
    `Budget key RAGFIN-${suffix} available only for finance role grants.`,
    adminToken,
  );
  const hrRoleDoc = await uploadRestrictedDoc(
    `HRRoleSecret-${suffix}`,
    `HR policy key RAGHR-${suffix} available only for HR role grants.`,
    adminToken,
  );
  const userDoc = await uploadRestrictedDoc(
    `UserSecret-${suffix}`,
    `Private key RAGUSER-${suffix} available only for direct user grants.`,
    adminToken,
  );

  const processed = {
    [financeRoleDoc.title]: (
      await waitForProcessed(financeRoleDoc.id, adminToken)
    ).status,
    [hrRoleDoc.title]: (await waitForProcessed(hrRoleDoc.id, adminToken))
      .status,
    [userDoc.title]: (await waitForProcessed(userDoc.id, adminToken)).status,
  };

  await createGrant(
    financeRoleDoc.id,
    {
      access_type: "role",
      role: financeRole.id,
      permission_level: "read",
      include_descendants: true,
    },
    adminToken,
  );

  await createGrant(
    hrRoleDoc.id,
    {
      access_type: "role",
      role: hrRole.id,
      permission_level: "read",
      include_descendants: true,
    },
    adminToken,
  );

  await createGrant(
    userDoc.id,
    {
      access_type: "user",
      user: directUser.id,
      permission_level: "read",
      include_descendants: true,
    },
    adminToken,
  );

  const users = [
    { key: "finance_user", record: financeUser },
    { key: "hr_user", record: hrUser },
    { key: "direct_user", record: directUser },
  ];

  const matrix = [];
  for (const u of users) {
    const loginData = await login(u.record.email, testPassword);
    const token = loginData.access;

    const accessible = normalizeList(
      await request(`/users/${u.record.id}/accessible-documents/`, {
        token: adminToken,
      }),
    ).map((d) => d.title);

    const ragFinanceRole = await ragQuery(
      `What is the key code RAGFIN-${suffix}?`,
      token,
    );
    const ragHrRole = await ragQuery(
      `What is the key code RAGHR-${suffix}?`,
      token,
    );
    const ragUser = await ragQuery(
      `What is the key code RAGUSER-${suffix}?`,
      token,
    );

    matrix.push({
      user: u.key,
      email: u.record.email,
      accessible_titles: accessible,
      rag_finance_role_sources: ragFinanceRole.ok
        ? (ragFinanceRole.sources || []).map((s) => s.title)
        : [],
      rag_hr_role_sources: ragHrRole.ok
        ? (ragHrRole.sources || []).map((s) => s.title)
        : [],
      rag_user_sources: ragUser.ok
        ? (ragUser.sources || []).map((s) => s.title)
        : [],
      rag_errors: {
        finance_role: ragFinanceRole.ok ? null : ragFinanceRole.error,
        hr_role: ragHrRole.ok ? null : ragHrRole.error,
        user: ragUser.ok ? null : ragUser.error,
      },
    });
  }

  const output = {
    suffix,
    created: {
      departments: [financeDept.name, hrDept.name],
      roles: [financeRole.name, hrRole.name],
      users: users.map((u) => u.record.email),
      documents: [financeRoleDoc.title, hrRoleDoc.title, userDoc.title],
      processed_status: processed,
    },
    matrix,
  };

  console.log(JSON.stringify(output, null, 2));
})();
