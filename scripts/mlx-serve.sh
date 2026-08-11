#!/usr/bin/env bash
# MLX server control for the CGV agent pipeline.
#
#   ./scripts/mlx-serve.sh start fast     # :8080 thinking OFF  -> editor, esp-texto (4B)
#   ./scripts/mlx-serve.sh start think    # :8081 thinking ON   -> verificador, esp-* (9B)
#   ./scripts/mlx-serve.sh start both
#   ./scripts/mlx-serve.sh status
#   ./scripts/mlx-serve.sh stop
#
# The two tiers differ by THINKING MODE, not by model. Qwen3.5 is a reasoning model:
# with thinking on it spends hundreds of tokens before answering, which is waste for a
# mechanical check and a real gain for a judgement call. Measured on this machine:
# a one-word structural answer cost 365 completion tokens with thinking on, 4 with it off.
#
# MEMORY (16 GB M1 Pro): 4B-4bit ~2.9 GB + 9B-4bit ~5.6 GB = ~8.5 GB of weights before
# any KV cache. Running BOTH plus opencode measured ~7 GB RSS and 15% system free, with
# the machine already paging. The pipeline is sequential, so prefer ONE tier at a time.

set -euo pipefail

VENV="${MLX_VENV:-$HOME/.venvs/mlx}"
PY="$VENV/bin/python"
LOG_DIR="${TMPDIR:-/tmp}"
M4B="mlx-community/Qwen3.5-4B-MLX-4bit"
M9B="mlx-community/Qwen3.5-9B-MLX-4bit"

[ -x "$PY" ] || { echo "error: no mlx venv at $VENV (set MLX_VENV)"; exit 2; }

port_pid() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }

wait_ready() {
  local port=$1
  for _ in $(seq 1 40); do
    curl -sf --max-time 2 "http://127.0.0.1:$port/v1/models" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

start_one() {
  local tier=$1 port model extra
  case "$tier" in
    fast)  port=8080; model="$M4B"; extra=(--chat-template-args '{"enable_thinking":false}') ;;
    think) port=8081; model="$M9B"; extra=() ;;
    *) echo "unknown tier: $tier (use fast|think)"; exit 2 ;;
  esac

  if [ -n "$(port_pid "$port")" ]; then
    echo "  $tier already listening on :$port"
    return 0
  fi

  echo "  starting $tier on :$port ($model)"
  nohup "$PY" -m mlx_lm server --port "$port" --model "$model" \
      --log-level WARNING "${extra[@]}" \
      > "$LOG_DIR/mlx-$tier.log" 2>&1 &

  if wait_ready "$port"; then
    echo "  ✓ $tier ready on :$port"
  else
    echo "  ✗ $tier failed to become ready — see $LOG_DIR/mlx-$tier.log"
    tail -5 "$LOG_DIR/mlx-$tier.log" || true
    return 1
  fi
}

case "${1:-status}" in
  start)
    case "${2:-both}" in
      fast)  start_one fast ;;
      think) start_one think ;;
      both)
        echo "note: both tiers on 16 GB is tight — the pipeline is sequential, one is usually enough"
        start_one fast; start_one think ;;
      *) echo "usage: $0 start [fast|think|both]"; exit 2 ;;
    esac
    ;;
  stop)
    pkill -f "mlx_lm server" 2>/dev/null && echo "stopped" || echo "nothing running"
    ;;
  status)
    for p in 8080 8081; do
      pid=$(port_pid "$p")
      if [ -n "$pid" ]; then
        # Read the pinned model from the process args -- /v1/models lists every
        # model the server COULD load, so its first entry is not what is loaded.
        name=$(ps -o args= -p "$pid" 2>/dev/null \
               | sed -n 's/.*--model \([^ ]*\).*/\1/p' | head -1)
        think=$(ps -o args= -p "$pid" 2>/dev/null | grep -q enable_thinking \
               && echo "thinking:off" || echo "thinking:on")
        echo ":$p  up   pid=$pid  ${name:-unpinned}  $think"
      else
        echo ":$p  down"
      fi
    done
    ps -Ao rss,comm 2>/dev/null | grep -i python \
      | awk '{s+=$1} END {if (s>0) printf "python RSS total: %.1f GB\n", s/1048576}'
    ;;
  *)
    echo "usage: $0 {start [fast|think|both]|stop|status}"; exit 2 ;;
esac
