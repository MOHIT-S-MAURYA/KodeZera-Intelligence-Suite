#!/usr/bin/env python3
"""
Quick test: verify the RAG chat endpoint returns a real AI response (not dev-mode mock).
Run: .venv/bin/python scripts/test_chat_response.py
"""
import sys
import os
import json
import urllib.request

BASE = 'http://localhost:8000/api/v1'

def login(email, password):
    req = urllib.request.Request(
        f'{BASE}/auth/login/',
        data=json.dumps({'email': email, 'password': password}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())['access']


def chat(token, question):
    req = urllib.request.Request(
        f'{BASE}/rag/query/',
        data=json.dumps({'question': question}).encode(),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
    )
    full_answer = ''
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw_line in resp:
            line = raw_line.decode().strip()
            if not line.startswith('data:'):
                continue
            d = json.loads(line[5:])
            if 'chunk' in d:
                full_answer += d['chunk']
                print('.', end='', flush=True)
            if d.get('done'):
                break
    print()
    return full_answer


def main():
    print('Logging in...')
    try:
        token = login('test@example.com', 'admin123')
    except Exception as e:
        print(f'Login failed: {e}')
        sys.exit(1)
    print('Logged in.')

    question = 'What is the Kodezera Intelligence Suite?'
    print(f'Asking: {question!r}')
    answer = chat(token, question)

    print('\n=== RESPONSE ===')
    print(answer[:600])
    print('================')

    is_mock = '⚠️ **Dev Mode' in answer
    is_empty = not answer.strip()
    is_unconfigured = 'LLM provider not configured' in answer

    if is_mock:
        print('\n❌ FAIL: Got dev-mode mock response')
        sys.exit(1)
    elif is_empty:
        print('\n❌ FAIL: Empty response')
        sys.exit(1)
    elif is_unconfigured:
        print('\n❌ FAIL: LLM provider not configured/unsupported')
        sys.exit(1)
    else:
        print('\n✅ PASS: Real AI response received')


if __name__ == '__main__':
    main()
