"""
Сервис для работы с Ollama LLM
"""
import json
import asyncio
from typing import Optional, Dict, Any, AsyncGenerator
import ollama
from loguru import logger

from backend.config import settings


class LLMService:
    """Сервис для работы с локальной LLM через Ollama"""
    
    def __init__(self):
        self.model = settings.ollama_model
        self.client = ollama.AsyncClient(host=settings.ollama_base_url)
        
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        json_mode: bool = False
    ) -> str:
        """
        Генерация текста с помощью LLM
        
        Args:
            prompt: Основной промпт
            system_prompt: Системный промпт
            temperature: Температура генерации
            max_tokens: Максимальное количество токенов
            json_mode: Режим JSON вывода
        
        Returns:
            Сгенерированный текст
        """
        try:
            messages = []
            
            if system_prompt:
                messages.append({
                    "role": "system",
                    "content": system_prompt
                })
            
            messages.append({
                "role": "user", 
                "content": prompt
            })
            
            options = {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
            
            # Добавляем format для JSON режима
            format_param = "json" if json_mode else None
            
            # Логируем входные данные LLM
            logger.info("=" * 80)
            logger.info("LLM INPUT - System Prompt:")
            logger.info("-" * 80)
            if system_prompt:
                logger.info(system_prompt[:1000] + ("..." if len(system_prompt) > 1000 else ""))
            else:
                logger.info("(no system prompt)")
            logger.info("-" * 80)
            logger.info("LLM INPUT - User Prompt:")
            logger.info("-" * 80)
            logger.info(prompt[:1000] + ("..." if len(prompt) > 1000 else ""))
            logger.info("-" * 80)
            logger.info(f"LLM request: model={self.model}, json_mode={json_mode}, "
                       f"prompt_length={len(prompt)}, system_prompt_length={len(system_prompt) if system_prompt else 0}, "
                       f"temperature={temperature}, max_tokens={max_tokens}")
            logger.info("=" * 80)
            
            # Добавляем таймаут для запроса. think=False — для reasoning-моделей
            # (qwen3, qwen3.5 и пр.), чтобы контент попадал в message.content, а не в thinking.
            try:
                response = await asyncio.wait_for(
                    self.client.chat(
                        model=self.model,
                        messages=messages,
                        options=options,
                        format=format_param,
                        think=False,
                    ),
                    timeout=settings.llm_timeout
                )
            except asyncio.TimeoutError:
                logger.error(f"LLM request timeout after {settings.llm_timeout}s")
                raise TimeoutError(f"LLM request timeout after {settings.llm_timeout}s")
            
            # Проверяем наличие ответа
            if not response or 'message' not in response:
                logger.error(f"LLM returned empty or invalid response: {response}")
                raise ValueError("LLM returned empty response")
            
            msg_obj = response.get('message', {}) or {}
            result = msg_obj.get('content', '') or ''
            # На случай, если всё-таки пришло в thinking (напр., модель проигнорировала think=False)
            if not result.strip():
                thinking = msg_obj.get('thinking') or ''
                if thinking.strip():
                    logger.warning("LLM content пуст, использую содержимое thinking")
                    result = thinking.strip()
            
            if not result or len(result.strip()) == 0:
                logger.error(f"LLM returned empty content. Full response: {response}")
                raise ValueError("LLM returned empty content")
            
            logger.info("=" * 80)
            logger.info("LLM OUTPUT:")
            logger.info("-" * 80)
            logger.info(result[:2000] + ("..." if len(result) > 2000 else ""))
            logger.info("-" * 80)
            logger.info(f"LLM response length: {len(result)} chars")
            logger.info("=" * 80)
            
            return result
            
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            raise
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """
        Потоковая генерация текста
        
        Args:
            prompt: Основной промпт
            system_prompt: Системный промпт
            temperature: Температура генерации
        
        Yields:
            Части сгенерированного текста
        """
        try:
            messages = []
            
            if system_prompt:
                messages.append({
                    "role": "system",
                    "content": system_prompt
                })
            
            messages.append({
                "role": "user",
                "content": prompt
            })
            
            options = {
                "temperature": temperature,
            }
            
            async for chunk in await self.client.chat(
                model=self.model,
                messages=messages,
                options=options,
                stream=True
            ):
                if 'message' in chunk and 'content' in chunk['message']:
                    yield chunk['message']['content']
                    
        except Exception as e:
            logger.error(f"LLM stream error: {e}")
            raise
    
    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        schema_hint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Генерация структурированного JSON ответа
        
        Args:
            prompt: Промпт с описанием задачи
            system_prompt: Системный промпт
            schema_hint: Подсказка по схеме JSON
        
        Returns:
            Распарсенный JSON объект
        """
        enhanced_prompt = prompt
        
        if schema_hint:
            schema_json = json.dumps(schema_hint, ensure_ascii=False, indent=2)
            enhanced_prompt += f"\n\nОжидаемый формат JSON:\n```json\n{schema_json}\n```"
            logger.debug(f"Schema hint added: {len(schema_json)} chars")
        
        enhanced_prompt += "\n\nОтветь ТОЛЬКО валидным JSON без дополнительного текста."
        
        logger.info("=" * 80)
        logger.info("LLM JSON GENERATION - Enhanced Prompt:")
        logger.info("-" * 80)
        logger.info(enhanced_prompt[:2000] + ("..." if len(enhanced_prompt) > 2000 else ""))
        logger.info("-" * 80)
        logger.info(f"Enhanced prompt length: {len(enhanced_prompt)} chars")
        logger.info("=" * 80)
        
        try:
            result = await self.generate(
                prompt=enhanced_prompt,
                system_prompt=system_prompt,
                temperature=0.3,  # Низкая температура для структурированного вывода
                json_mode=True
            )
        except (TimeoutError, ValueError) as e:
            logger.error(f"LLM generation failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected LLM error: {e}")
            raise ValueError(f"LLM generation failed: {str(e)}")
        
        # Проверяем, что результат не пустой
        if not result or len(result.strip()) == 0:
            logger.error("LLM returned empty result in generate_json")
            raise ValueError("LLM returned empty result")
        
        # Парсим JSON
        try:
            # Очищаем от возможных markdown блоков
            clean_result = result.strip()
            if clean_result.startswith("```json"):
                # Удаляем ```json и ```
                clean_result = clean_result[7:]  # Убираем ```json
                if clean_result.endswith("```"):
                    clean_result = clean_result[:-3]
                clean_result = clean_result.strip()
            elif clean_result.startswith("```"):
                lines = clean_result.split("\n")
                clean_result = "\n".join(lines[1:-1])
            
            return json.loads(clean_result)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}, result length: {len(result)}, preview: {result[:500]}")
            # Пытаемся извлечь JSON из текста
            import re
            json_match = re.search(r'\{.*\}', result, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"Failed to parse LLM response as JSON. Response length: {len(result)}, preview: {result[:200]}")
    
    async def check_connection(self) -> bool:
        """Проверка подключения к Ollama"""
        try:
            response = await self.client.list()
            # Response can be dict with 'models' key or direct list
            if isinstance(response, dict):
                models_list = response.get('models', [])
            else:
                models_list = response if response else []
            
            # Extract model names (handle both dict and object formats)
            model_names = []
            for m in models_list:
                if isinstance(m, dict):
                    name = m.get('name', m.get('model', ''))
                else:
                    name = getattr(m, 'model', getattr(m, 'name', str(m)))
                if name:
                    model_names.append(name)
            
            logger.info(f"Ollama connected. Available models: {model_names}")
            target_model = self.model.split(':')[0]
            return any(target_model in m for m in model_names)
        except Exception as e:
            logger.error(f"Ollama connection error: {e}")
            return False


# Singleton instance
llm_service = LLMService()
