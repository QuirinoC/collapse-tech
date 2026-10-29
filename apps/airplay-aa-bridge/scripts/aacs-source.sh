#!/usr/bin/env bash
# Check out a selected source revision without overwriting an existing tree.

ensure_pinned_source() {
  local target="$1" repository="$2" revision="$3" name="$4" actual root submodules
  if [[ ! -e "$target" ]]; then
    git clone --no-checkout -- "$repository" "$target" || return 1
    git -C "$target" checkout --detach "$revision" || return 1
    git -C "$target" submodule update --init --recursive || return 1
  else
    [[ -d "$target" ]] || { echo "$name source path is not a directory: $target" >&2; return 1; }
    root=$(git -C "$target" rev-parse --show-toplevel) || return 1
    [[ "$(cd "$root" && pwd -P)" == "$(cd "$target" && pwd -P)" ]] || {
      echo "$name source path is not a repository root: $target" >&2; return 1;
    }
  fi
  actual=$(git -C "$target" rev-parse HEAD) || return 1
  [[ "$actual" == "$revision" ]] || {
    echo "$name source revision $actual does not match required $revision; existing files were preserved." >&2
    return 1
  }
  submodules=$(git -C "$target" submodule status --recursive) || return 1
  if [[ "$submodules" =~ (^|$'\n')[-+U] ]]; then
    echo "$name submodules are missing or differ from the required revision; existing files were preserved." >&2
    return 1
  fi
  echo "$name source revision: $actual"
}

ensure_aacs_source() {
  ensure_pinned_source "$1" "$2" "$3" AACS
}
