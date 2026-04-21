#!/bin/bash
#
# Платформа AI-сотрудников АО «Газпром Шельфпроект» (GSP) — скрипт запуска.
#
# Что делает скрипт:
#   1) проверяет Ollama и нужную модель;
#   2) поднимает Python venv и ставит зависимости;
#   3) ставит зависимости фронта (Vite + React);
#   4) освобождает порты 8000 и 5173 от зависших процессов;
#   5) стартует backend (FastAPI) и frontend (Vite) в фоне;
#   6) печатает URL и ждёт Ctrl+C для аккуратной остановки.
#
# Флаги:
#   --reload           запустить backend с --reload (авто-перезагрузка при правке кода).
#   --skip-deps        не ставить зависимости (быстрый рестарт).
#   --model <name>     переопределить модель Ollama (по умолчанию — qwen3.5:2b).

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🏭 GSP · Платформа AI-сотрудников — запуск${NC}"
echo "============================================="

# ---------- Args ----------
RELOAD=false
SKIP_DEPS=false
OLLAMA_MODEL="qwen3.5:2b"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reload)     RELOAD=true; shift ;;
    --skip-deps)  SKIP_DEPS=true; shift ;;
    --model)      OLLAMA_MODEL="$2"; shift 2 ;;
    *) echo "Неизвестный флаг: $1"; exit 1 ;;
  esac
done

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

# ---------- Python ----------
if command -v python3 &> /dev/null; then
  PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
  PYTHON_CMD="python"
else
  echo -e "${RED}✗ Python не найден. Установите Python 3.11+: brew install python@3.11${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Python: $($PYTHON_CMD --version)${NC}"

# ---------- Ollama ----------
echo -e "\n${YELLOW}1. Проверка Ollama…${NC}"
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Ollama запущена${NC}"
else
  echo -e "${RED}✗ Ollama не запущена. Выполните в отдельном окне:${NC}"
  echo "    ollama serve"
  echo "  либо установите: curl -fsSL https://ollama.com/install.sh | sh"
  exit 1
fi

echo -e "\n${YELLOW}2. Проверка модели ${OLLAMA_MODEL}…${NC}"
if ollama list | grep -q "${OLLAMA_MODEL}"; then
  echo -e "${GREEN}✓ Модель ${OLLAMA_MODEL} доступна${NC}"
else
  echo -e "${YELLOW}⟳ Загружаю модель ${OLLAMA_MODEL}…${NC}"
  ollama pull "${OLLAMA_MODEL}"
fi

# ---------- Python venv ----------
echo -e "\n${YELLOW}3. Виртуальное окружение (.venv)…${NC}"
if [ ! -d "$VENV_DIR" ]; then
  $PYTHON_CMD -m venv "$VENV_DIR"
  echo -e "${GREEN}✓ .venv создан${NC}"
else
  echo -e "${GREEN}✓ .venv существует${NC}"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo -e "${GREEN}✓ Активировано: $(which python)${NC}"

if [ "$SKIP_DEPS" = false ]; then
  echo -e "\n${YELLOW}4. Python-зависимости…${NC}"
  python -m pip install --upgrade pip > /dev/null
  pip install -r "$PROJECT_DIR/requirements.txt"
  echo -e "${GREEN}✓ Python-зависимости установлены${NC}"

  echo -e "\n${YELLOW}5. Node.js-зависимости (frontend)…${NC}"
  if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    (cd "$PROJECT_DIR/frontend" && npm install)
  else
    echo -e "${GREEN}✓ node_modules уже установлен${NC}"
  fi
else
  echo -e "${YELLOW}4–5. --skip-deps: пропускаю установку зависимостей${NC}"
fi

# ---------- Освобождение портов ----------
free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}⟳ Порт $port занят (pid: $pids) — останавливаю…${NC}"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}
echo -e "\n${YELLOW}6. Подготовка портов 8000 и 5173…${NC}"
free_port 8000
free_port 5173

# ---------- Backend ----------
echo -e "\n${YELLOW}7. Запуск Backend (FastAPI, :8000)…${NC}"
cd "$PROJECT_DIR"
BACKEND_CMD=(python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --log-level info)
if [ "$RELOAD" = true ]; then
  BACKEND_CMD+=(--reload)
  echo -e "${BLUE}  (включён --reload)${NC}"
fi
PYTHONPATH="$PROJECT_DIR" "${BACKEND_CMD[@]}" &
BACKEND_PID=$!

# ждём готовности
for i in {1..30}; do
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend готов${NC}"
    break
  fi
  sleep 0.5
  if [ "$i" -eq 30 ]; then
    echo -e "${RED}✗ Backend не поднялся за 15 секунд${NC}"
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 1
  fi
done

# ---------- Frontend ----------
echo -e "\n${YELLOW}8. Запуск Frontend (Vite, :5173)…${NC}"
(cd "$PROJECT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!
sleep 2

echo -e "\n${GREEN}============================================="
echo -e "🎉 Платформа запущена!"
echo -e "=============================================${NC}"
echo -e "🧑‍💼 AI-сотрудники (UI): ${BLUE}http://localhost:5173${NC}"
echo -e "🔧 API:                ${BLUE}http://localhost:8000${NC}"
echo -e "📚 API Docs:           ${BLUE}http://localhost:8000/docs${NC}"
echo -e "🩺 Health:             ${BLUE}http://localhost:8000/health${NC}"
echo ""
echo "Нажмите Ctrl+C для остановки обоих процессов."

trap 'echo -e "\n${YELLOW}⟳ Останавливаю сервисы…${NC}"; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; free_port 8000; free_port 5173; deactivate 2>/dev/null; exit 0' INT TERM
wait
