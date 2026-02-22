"""
Serializer for AIProviderConfig.
"""
from rest_framework import serializers
from apps.core.models import AIProviderConfig


class AIProviderConfigSerializer(serializers.ModelSerializer):
    """
    Serializer for the AI provider configuration singleton.
    - On READ:  llm_api_key and embedding_api_key are returned masked.
    - On WRITE: if the field is sent as '***...' (unchanged mask), the existing
                key is preserved. If a new value is provided, it is saved.
    """

    # Write-only: accepts the real key, never echoes it back
    llm_api_key_input = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        label='LLM API Key',
        help_text='Leave blank or send the masked value to keep the existing key.'
    )
    embedding_api_key_input = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        label='Embedding API Key',
        help_text='Leave blank or send the masked value to keep the existing key.'
    )

    # Read-only: always masked
    llm_api_key = serializers.SerializerMethodField()
    embedding_api_key = serializers.SerializerMethodField()

    class Meta:
        model = AIProviderConfig
        fields = [
            # LLM
            'llm_provider', 'llm_model', 'llm_api_key', 'llm_api_key_input', 'llm_api_base',
            # Embedding
            'embedding_provider', 'embedding_model', 'embedding_api_key',
            'embedding_api_key_input', 'embedding_api_base',
            # Limits
            'max_tokens_per_request', 'requests_per_minute',
            # Meta
            'updated_at',
        ]
        read_only_fields = ['updated_at']

    def get_llm_api_key(self, obj) -> str:
        return obj.llm_api_key_masked()

    def get_embedding_api_key(self, obj) -> str:
        return obj.embedding_api_key_masked()

    def update(self, instance, validated_data):
        """
        Handle key updates: only overwrite the stored key if a non-masked
        value is supplied. Masked values or blanks preserve the existing key.
        """
        llm_key_input = validated_data.pop('llm_api_key_input', None)
        emb_key_input = validated_data.pop('embedding_api_key_input', None)

        if llm_key_input is not None and '***' not in llm_key_input:
            instance.llm_api_key = llm_key_input

        if emb_key_input is not None and '***' not in emb_key_input:
            instance.embedding_api_key = emb_key_input

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
