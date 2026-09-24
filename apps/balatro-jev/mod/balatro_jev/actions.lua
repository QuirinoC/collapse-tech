-- Apply a ChosenAction payload from the Node bridge (action.json).
-- Code owns validation — never trust the model blindly.
--
-- Play / discard APIs confirmed against Steam Balatro (Love2D) + dualscreen mods:
--   G.hand:unhighlight_all()
--   G.hand:add_to_highlighted(card)   -- 0-based bridge indices → Lua cards[i+1]
--   G.FUNCS.play_cards_from_highlighted([e])
--   G.FUNCS.discard_cards_from_highlighted([e], [hook])
-- Shop / blind FUNCS take a UI element `e` (ref_table / UIBox) — left as TODOs.

local M = {}

local function indices_from(params)
  if not params then return {} end
  return params.card_indices or params.indices or {}
end

local function in_selecting_hand()
  return G
    and G.STATE
    and G.STATES
    and G.STATE == G.STATES.SELECTING_HAND
    and G.hand
    and G.hand.cards
end

--- Highlight hand cards by 0-based indices from the bridge.
--- @return boolean ok, string|nil err
local function highlight_hand_indices(idxs)
  if not in_selecting_hand() then
    return false, "not in SELECTING_HAND"
  end
  if type(idxs) ~= "table" or #idxs < 1 then
    return false, "empty card_indices"
  end
  if G.hand.unhighlight_all then
    G.hand:unhighlight_all()
  end
  local limit = (G.hand.config and G.hand.config.highlighted_limit) or 5
  local n = 0
  for _, zero_idx in ipairs(idxs) do
    local i = tonumber(zero_idx)
    if i == nil then
      return false, "non-numeric card index"
    end
    local card = G.hand.cards[i + 1]
    if not card then
      return false, "card index out of range: " .. tostring(i)
    end
    if n >= limit then
      break
    end
    G.hand:add_to_highlighted(card)
    n = n + 1
  end
  if n < 1 then
    return false, "no cards highlighted"
  end
  return true, nil
end

--- Apply one action table { id, kind, label, params }
--- @return boolean ok, string|nil err
function M.apply(action)
  if type(action) ~= "table" or not action.kind then
    return false, "missing action.kind"
  end

  local kind = action.kind
  local params = action.params or {}

  if kind == "noop" then
    return true, nil
  end

  if kind == "play_hand" then
    local idxs = indices_from(params)
    local ok, err = highlight_hand_indices(idxs)
    if not ok then return false, err end
    if not (G.FUNCS and G.FUNCS.play_cards_from_highlighted) then
      return false, "G.FUNCS.play_cards_from_highlighted missing"
    end
    G.FUNCS.play_cards_from_highlighted()
    return true, nil
  end

  if kind == "discard" then
    local idxs = indices_from(params)
    local ok, err = highlight_hand_indices(idxs)
    if not ok then return false, err end
    if not (G.FUNCS and G.FUNCS.discard_cards_from_highlighted) then
      return false, "G.FUNCS.discard_cards_from_highlighted missing"
    end
    G.FUNCS.discard_cards_from_highlighted()
    return true, nil
  end

  if kind == "select_blind" then
    -- TODO: G.FUNCS.select_blind(e) needs the blind-select UI element
    -- (e.config.ref_table = blind). Wire via G.blind_select children or
    -- highlight + click the matching select_blind_button once located in-game.
    print("[balatro_jev] TODO select_blind " .. tostring(params.blind_id))
    return false, "TODO: select_blind needs UI e.config.ref_table"
  end

  if kind == "skip_blind" then
    -- TODO: G.FUNCS.skip_blind(e) needs tag_container via e.UIBox.
    print("[balatro_jev] TODO skip_blind " .. tostring(params.blind_id))
    return false, "TODO: skip_blind needs UI e.UIBox tag_container"
  end

  if kind == "buy" then
    -- TODO: G.FUNCS.buy_from_shop(e) with e.config.ref_table = Card in shop.
    -- Map params.shop_index → G.shop_jokers.cards[i+1] then synthesize e, or
    -- highlight the card and invoke the buy button path.
    print("[balatro_jev] TODO buy shop_index=" .. tostring(params.shop_index))
    return false, "TODO: buy needs shop Card ref via buy_from_shop(e)"
  end

  if kind == "reroll" then
    -- G.FUNCS.reroll_shop(e) mostly ignores e beyond stop_use; try bare call.
    if G.FUNCS and G.FUNCS.reroll_shop then
      local ok, err = pcall(function() G.FUNCS.reroll_shop({}) end)
      if ok then return true, nil end
      return false, "reroll_shop error: " .. tostring(err)
    end
    return false, "G.FUNCS.reroll_shop missing"
  end

  if kind == "cash_out" then
    -- G.FUNCS.cash_out(e) mutates e.config.button; also try toggle_shop to leave shop.
    if G.STATE and G.STATES and G.STATE == G.STATES.ROUND_EVAL and G.FUNCS.cash_out then
      local ok, err = pcall(function() G.FUNCS.cash_out({ config = {} }) end)
      if ok then return true, nil end
      return false, "cash_out error: " .. tostring(err)
    end
    if G.STATE and G.STATES and G.STATE == G.STATES.SHOP and G.FUNCS.toggle_shop then
      -- Leave shop → blind select. toggle_shop expects a UI e; stub may fail.
      local ok, err = pcall(function() G.FUNCS.toggle_shop({ config = {} }) end)
      if ok then return true, "toggle_shop" end
      return false, "TODO: leave shop via toggle_shop UI — " .. tostring(err)
    end
    return false, "TODO: cash_out / leave shop (wrong state or missing FUNCS)"
  end

  if kind == "use_consumable" or kind == "sell" then
    -- TODO: use_card / sell_card paths need the Card as e.config.ref_table.
    print("[balatro_jev] TODO " .. kind)
    return false, "TODO: " .. kind .. " needs Card UI ref"
  end

  return false, "unknown kind: " .. tostring(kind)
end

return M
