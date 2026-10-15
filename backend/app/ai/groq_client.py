import json
import logging
from typing import Dict, Any, List, Optional
import httpx
from ..core.config import settings

logger = logging.getLogger("precursor_x.ai.groq")


class GroqConfigurationError(Exception):
    """Raised when Groq API key is not configured."""
    pass


class GroqAPIError(Exception):
    """Raised when Groq API request fails or returns an error."""
    pass


class GroqClient:
    """
    Dedicated client for Groq Cloud AI Engine.
    Uses async httpx with Bearer token authentication against Groq chat completions endpoint.
    Enforces JSON mode and validates response integrity.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.model = model or settings.GROQ_MODEL
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

    async def chat_completion_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> Dict[str, Any]:
        """
        Executes a chat completion with JSON mode enforced.
        Returns the parsed dictionary.
        """
        if not self.api_key or self.api_key == "your_groq_api_key_here":
            raise GroqConfigurationError(
                "GROQ_API_KEY is not configured on the backend server. "
                "Please configure a valid GROQ_API_KEY in the backend environment."
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"}
        }

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                response = await client.post(self.base_url, headers=headers, json=payload)
                
                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(f"Groq API returned error status {response.status_code}: {error_detail}")
                    raise GroqAPIError(f"Groq API error ({response.status_code}): {error_detail}")

                data = response.json()
                content = data["choices"][0]["message"]["content"]
                
                try:
                    return json.loads(content)
                except json.JSONDecodeError as jde:
                    logger.error(f"Failed to parse Groq JSON response: {content}")
                    raise GroqAPIError(f"Groq returned malformed JSON: {str(jde)}")

        except httpx.TimeoutException:
            logger.error("Timeout connecting to Groq AI service")
            raise GroqAPIError("Groq AI service timed out while processing safety analysis.")
        except httpx.RequestError as req_err:
            logger.error(f"Network error connecting to Groq: {req_err}")
            raise GroqAPIError(f"Network error connecting to Groq AI service: {str(req_err)}")
