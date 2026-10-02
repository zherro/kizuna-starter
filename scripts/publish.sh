#!/usr/bin/env bash
# Publica core + starter: incrementa o patch do "version" de cada um (mostrado no rodapé),
# commita tudo e dá push — primeiro o kizuna-core, depois o starter com o ponteiro atualizado.
# Uso: scripts/publish.sh "mensagem do commit"
set -euo pipefail

MSG="${1:?uso: scripts/publish.sh \"mensagem do commit\"}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRAILER="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

bump() { (cd "$1" && npm version patch --no-git-tag-version >/dev/null && node -p "require('./package.json').version"); }

# ---- core ----
cd "$ROOT/kizuna-core"
CORE_BRANCH="$(git branch --show-current)"
if [ -n "$(git status --porcelain)" ]; then
  CORE_VERSION="$(bump .)"
  git add -A
  git commit -m "$MSG" -m "core v$CORE_VERSION" -m "$TRAILER"
fi
git push origin "$CORE_BRANCH"

# ---- starter ----
cd "$ROOT"
APP_VERSION="$(bump .)"
git add -A
git commit -m "$MSG" -m "v$APP_VERSION · core $(node -p "require('./kizuna-core/package.json').version")" -m "$TRAILER"
git push origin "$(git branch --show-current)"

echo "Publicado: v$APP_VERSION · core $(node -p "require('./kizuna-core/package.json').version")"
