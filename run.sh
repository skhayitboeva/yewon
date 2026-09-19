#!/usr/bin/env bash
#
# 로컬 개발 서버 시작/중지 — 프론트엔드(Vite)와 백엔드(Netlify Functions)를 함께 관리합니다.
#
#   ./run.sh start     백그라운드로 기동
#   ./run.sh stop      종료 (자식 Vite 프로세스까지)
#   ./run.sh restart
#   ./run.sh status
#   ./run.sh logs      로그 실시간 보기 (Ctrl+C 로 빠져나와도 서버는 계속 실행)
#
# netlify dev 한 프로세스가 Vite(5173)를 자식으로 띄우고 8888에서 /api/* 와 함께 서빙합니다.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RUN_DIR="$ROOT/.dev"
PID_FILE="$RUN_DIR/dev.pid"
LOG_FILE="$RUN_DIR/dev.log"
PORT="${PORT:-8888}"
VITE_PORT="${VITE_PORT:-5173}"

port_pids() { lsof -ti "tcp:$1" 2>/dev/null || true; }

running_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

# netlify dev 는 Vite 를 자식으로 띄우므로 부모만 죽이면 5173 이 남는다.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}

cmd_start() {
  local pid
  if pid="$(running_pid)"; then
    echo "이미 실행 중입니다 (PID $pid) → http://localhost:$PORT"
    return 0
  fi

  local busy
  busy="$(port_pids "$PORT")"
  if [[ -n "$busy" ]]; then
    echo "포트 $PORT 를 다른 프로세스가 사용 중입니다 (PID: ${busy//$'\n'/ })."
    echo "  ./run.sh stop  으로 정리한 뒤 다시 시도하세요."
    return 1
  fi

  [[ -f .env ]]        || { echo ".env 가 없습니다.  cp .env.example .env  후 값을 채우세요."; return 1; }
  [[ -d node_modules ]]|| { echo "의존성이 없습니다.  npm install  을 먼저 실행하세요."; return 1; }
  command -v netlify >/dev/null 2>&1 || { echo "netlify CLI 가 없습니다.  npm i -g netlify-cli"; return 1; }

  mkdir -p "$RUN_DIR"
  : > "$LOG_FILE"
  nohup netlify dev >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  pid="$(cat "$PID_FILE")"

  printf "기동 중"
  local i
  for i in $(seq 1 90); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo
      echo "시작에 실패했습니다. 로그 마지막 30줄:"
      echo "────────────────────────────────────────"
      tail -n 30 "$LOG_FILE" || true
      rm -f "$PID_FILE"
      return 1
    fi
    if curl -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
      echo " 완료"
      echo
      echo "  앱          http://localhost:$PORT"
      echo "  API         http://localhost:$PORT/api/*"
      echo "  PID $pid    로그: ./run.sh logs"
      echo
      echo "  ⚠ .env 의 MongoDB Atlas 를 그대로 사용합니다 — Netlify 배포본과 같은 DB입니다."
      echo "    로컬에서 수정/삭제한 내용이 실제 운영 데이터에 그대로 반영됩니다."
      return 0
    fi
    printf "."
    sleep 1
  done

  echo
  echo "90초 안에 응답이 없습니다. 로그를 확인하세요: ./run.sh logs"
  return 1
}

cmd_stop() {
  local pid found=0
  if pid="$(running_pid)"; then
    kill_tree "$pid"
    found=1
  fi

  local p x
  for p in "$PORT" "$VITE_PORT"; do
    for x in $(port_pids "$p"); do
      kill -TERM "$x" 2>/dev/null && found=1 || true
    done
  done

  if [[ "$found" -eq 0 ]]; then
    rm -f "$PID_FILE"
    echo "실행 중인 개발 서버가 없습니다."
    return 0
  fi

  sleep 2
  for p in "$PORT" "$VITE_PORT"; do
    for x in $(port_pids "$p"); do
      kill -KILL "$x" 2>/dev/null || true
    done
  done

  rm -f "$PID_FILE"
  echo "종료했습니다 (포트 $PORT, $VITE_PORT 정리 완료)."
}

cmd_status() {
  local pid
  if pid="$(running_pid)"; then
    echo "실행 중 — PID $pid"
  elif [[ -n "$(port_pids "$PORT")" ]]; then
    echo "PID 파일은 없지만 포트 $PORT 가 사용 중입니다 (PID: $(port_pids "$PORT" | tr '\n' ' '))."
  else
    echo "중지됨"
    return 0
  fi

  local p
  for p in "$PORT" "$VITE_PORT"; do
    local owner
    owner="$(port_pids "$p" | tr '\n' ' ')"
    printf "  포트 %-6s %s\n" "$p" "${owner:-(비어 있음)}"
  done

  if curl -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
    echo "  응답      정상 → http://localhost:$PORT"
  else
    echo "  응답      없음"
  fi
}

cmd_logs() {
  [[ -f "$LOG_FILE" ]] || { echo "로그가 없습니다. 먼저 ./run.sh start 를 실행하세요."; return 1; }
  tail -n 50 -f "$LOG_FILE"
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; echo; cmd_start ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *)
    echo "사용법: ./run.sh {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
