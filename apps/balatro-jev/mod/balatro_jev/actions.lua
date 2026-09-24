-- Apply a ChosenAction payload from the Node bridge (action.json).
-- Wired against Steam Balatro 1.0.1o (functions/button_callbacks.lua).
--
-- Confirmed FUNCS:
--   play/discard: highlight → G.FUNCS.play_cards_from_highlighted / discard_cards_from_highlighted
--   select_blind(e): e.config.ref_table = G.P_BLINDS[...]  (UI: select_blind_button)
--   skip_blind(e):   e.UIBox:get_UIE_by_ID('tag_container')
--   buy_from_shop(e): e.config.ref_table = Card
--   use_card(e): packs/vouchers/consumables/pack picks (booster open via can_open → use_card)
--   sell_card(e): e.config.ref_table = Card
--   reroll_shop / toggle_shop / cash_out / skip_booster / start_run / go_to_menu

local M = {}

local function indices_from(params)
  if not params then return {} end
  return params.card_indices or params.indices or {}
end

local function fake_e(ref_table, extra)
  local e = { config = { ref_table = ref_table } }
  if extra then
    for k, v in pairs(extra) do
      e.config[k] = v
    end
  end
  return e
end

local function normalize_blind_key(id)
  if not id then return nil end
  local s = tostring(id):lower()
  if s == "small" then return "Small" end
  if s == "big" or s == "large" then return "Big" end
  if s == "boss" then return "Boss" end
  -- already native?
  if s == "small" or id == "Small" then return "Small" end
  if id == "Big" or id == "Boss" or id == "Small" then return id end
  return id:sub(1, 1):upper() .. id:sub(2):lower()
end

local function in_selecting_hand()
  return G
    and G.STATE
    and G.STATES
    and G.STATE == G.STATES.SELECTING_HAND
    and G.hand
    and G.hand.cards
end

local function is_pack_state()
  if not (G and G.STATE and G.STATES) then return false end
  local st = G.STATE
  return st == G.STATES.TAROT_PACK
    or st == G.STATES.PLANET_PACK
    or st == G.STATES.SPECTRAL_PACK
    or st == G.STATES.STANDARD_PACK
    or st == G.STATES.BUFFOON_PACK
    or (G.STATES.SMODS_BOOSTER_OPENED and st == G.STATES.SMODS_BOOSTER_OPENED)
end

--- Highlight hand cards by 0-based indices from the bridge.
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
    if n >= limit then break end
    G.hand:add_to_highlighted(card)
    n = n + 1
  end
  if n < 1 then
    return false, "no cards highlighted"
  end
  return true, nil
end

local function blind_opts_key(native)
  if not native then return nil end
  return string.lower(native) -- G.blind_select_opts.small/big/boss
end

local function find_select_blind_button(native)
  local key = blind_opts_key(native)
  if not key then return nil end
  local opts = G.blind_select_opts and G.blind_select_opts[key]
  if opts and opts.get_UIE_by_ID then
    return opts:get_UIE_by_ID("select_blind_button")
  end
  return nil
end

local function find_skip_blind_e(native)
  local key = blind_opts_key(native or (G.GAME and G.GAME.blind_on_deck))
  local opts = G.blind_select_opts and key and G.blind_select_opts[key]
  if not opts then return nil end
  -- skip_blind reads e.UIBox:get_UIE_by_ID('tag_container')
  return { UIBox = opts, config = {} }
end

local function shop_card_from_params(params)
  local area_name = params.shop_area or params.area
  local slot = tonumber(params.shop_slot or params.slot)
  local flat = tonumber(params.shop_index)

  local areas = {
    { name = "shop_jokers", area = G.shop_jokers },
    { name = "shop_vouchers", area = G.shop_vouchers },
    { name = "shop_booster", area = G.shop_booster },
  }

  if area_name and slot ~= nil then
    local area = G[area_name]
    if area and area.cards and area.cards[slot + 1] then
      return area.cards[slot + 1], area_name
    end
  end

  -- Flat index across areas in dump order
  if flat ~= nil then
    local i = 0
    for _, entry in ipairs(areas) do
      local area = entry.area
      if area and area.cards then
        for _, card in ipairs(area.cards) do
          if i == flat then
            return card, entry.name
          end
          i = i + 1
        end
      end
    end
  end

  return nil, nil
end

local function card_from_area(area, index)
  if not area or not area.cards then return nil end
  local i = tonumber(index)
  if i == nil then return nil end
  return area.cards[i + 1]
end

-- Real Cash Out button lives in a UIBox with major=G.round_eval, registered in
-- G.I.UIBOX. It only appears after payout animation completes.
local function find_cash_out_button()
  if not (G and G.I and G.I.UIBOX) then
    return nil
  end
  for _, box in ipairs(G.I.UIBOX) do
    if box and box.get_UIE_by_ID then
      local ok, btn = pcall(function()
        return box:get_UIE_by_ID("cash_out_button")
      end)
      if ok and btn and btn.config and btn.config.button == "cash_out" then
        return btn
      end
    end
  end
  return nil
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
    if not (G and G.blind_select) then
      return false, "blind_select UI not ready (state=" .. tostring(G and G.STATE) .. ")"
    end
    if not (G.FUNCS and G.FUNCS.select_blind) then
      return false, "G.FUNCS.select_blind missing"
    end
    local native = normalize_blind_key(params.native_key or params.blind_id)
      or (G.GAME and G.GAME.blind_on_deck)
    -- Prefer real UI button so ref_table + UIBox/tag_container are correct
    local btn = find_select_blind_button(native)
    if btn and G.FUNCS.select_blind then
      local ok, err = pcall(function() G.FUNCS.select_blind(btn) end)
      if ok then return true, "select_blind_button:" .. tostring(native) end
      return false, "select_blind UI error: " .. tostring(err)
    end
    -- Synthesize e with P_BLINDS config + UIBox from blind_select_opts
    local choice_key = G.GAME.round_resets
      and G.GAME.round_resets.blind_choices
      and G.GAME.round_resets.blind_choices[native]
    local ref = choice_key and G.P_BLINDS and G.P_BLINDS[choice_key]
    if not ref then
      return false, "missing blind ref for " .. tostring(native) .. " (no select_blind_button either)"
    end
    if G.GAME.blind_on_deck and native and G.GAME.blind_on_deck ~= native then
      native = G.GAME.blind_on_deck
      choice_key = G.GAME.round_resets.blind_choices[native]
      ref = G.P_BLINDS[choice_key]
    end
    local opts_key = blind_opts_key(native)
    local opts = opts_key and G.blind_select_opts and G.blind_select_opts[opts_key]
    local e = fake_e(ref)
    e.config.id = native
    if opts then
      e.UIBox = opts
    elseif G.blind_select then
      e.UIBox = G.blind_select
    end
    local ok, err = pcall(function()
      G.FUNCS.select_blind(e)
    end)
    if ok then return true, "select_blind_synth:" .. tostring(native) end
    return false, "select_blind error: " .. tostring(err)
  end

  if kind == "skip_blind" then
    if not (G and G.blind_select) then
      return false, "blind_select UI not ready (state=" .. tostring(G and G.STATE) .. ")"
    end
    local native = normalize_blind_key(params.native_key or params.blind_id)
      or (G.GAME and G.GAME.blind_on_deck)
    if native == "Boss" then
      return false, "boss blind is not skippable"
    end
    local e = find_skip_blind_e(native)
    if not e then
      return false, "blind_select_opts missing for skip " .. tostring(native)
    end
    local tag = e.UIBox:get_UIE_by_ID("tag_container")
    if not tag then
      return false, "tag_container missing (cannot skip)"
    end
    local ok, err = pcall(function() G.FUNCS.skip_blind(e) end)
    if ok then return true, "skip_blind:" .. tostring(native) end
    return false, "skip_blind error: " .. tostring(err)
  end

  if kind == "buy" then
    if not (G.STATE == G.STATES.SHOP) then
      return false, "not in SHOP"
    end
    local card, area_name = shop_card_from_params(params)
    if not card then
      return false, "shop card not found"
    end
    local set = card.ability and card.ability.set
    -- Boosters + vouchers ultimately go through use_card (can_open/can_redeem rewrite button)
    if set == "Booster" or set == "Voucher" then
      if not G.FUNCS.use_card then
        return false, "G.FUNCS.use_card missing"
      end
      local ok, err = pcall(function() G.FUNCS.use_card(fake_e(card)) end)
      if ok then return true, "use_card:" .. tostring(area_name) end
      return false, "buy use_card error: " .. tostring(err)
    end
    if not G.FUNCS.buy_from_shop then
      return false, "G.FUNCS.buy_from_shop missing"
    end
    local ok, err = pcall(function() G.FUNCS.buy_from_shop(fake_e(card)) end)
    if ok then return true, "buy_from_shop:" .. tostring(area_name) end
    return false, "buy_from_shop error: " .. tostring(err)
  end

  if kind == "reroll" then
    if not (G.STATE == G.STATES.SHOP) then
      return false, "not in SHOP"
    end
    if not (G.FUNCS and G.FUNCS.reroll_shop) then
      return false, "G.FUNCS.reroll_shop missing"
    end
    local ok, err = pcall(function() G.FUNCS.reroll_shop({}) end)
    if ok then return true, nil end
    return false, "reroll_shop error: " .. tostring(err)
  end

  if kind == "leave_shop" or (kind == "cash_out" and G.STATE == G.STATES.SHOP) then
    if not (G.STATE == G.STATES.SHOP) then
      return false, "not in SHOP"
    end
    if not (G.FUNCS and G.FUNCS.toggle_shop) then
      return false, "G.FUNCS.toggle_shop missing"
    end
    -- toggle_shop barely uses e; empty config is enough
    local ok, err = pcall(function() G.FUNCS.toggle_shop({ config = {} }) end)
    if ok then return true, "toggle_shop" end
    return false, "toggle_shop error: " .. tostring(err)
  end

  if kind == "cash_out" then
    if not (G.STATE == G.STATES.ROUND_EVAL) then
      return false, "not in ROUND_EVAL"
    end
    if not (G.FUNCS and G.FUNCS.cash_out) then
      return false, "G.FUNCS.cash_out missing"
    end
    -- MUST wait for cash_out_button. Early cash_out removes G.round_eval while
    -- add_round_eval_row events still index it → common_events.lua crash.
    local btn = find_cash_out_button()
    if not btn then
      return false, "cash_out button not ready (payout anim still running)"
    end
    if not G.round_eval then
      return false, "G.round_eval missing (already cashed out?)"
    end
    local ok, err = pcall(function()
      G.FUNCS.cash_out(btn)
    end)
    if ok then return true, "cash_out_button" end
    return false, "cash_out error: " .. tostring(err)
  end

  if kind == "sell" then
    local target = params.target or "joker"
    local idx = params.index
    local card
    if target == "consumable" then
      card = card_from_area(G.consumeables, idx)
    else
      card = card_from_area(G.jokers, idx)
    end
    if not card then
      return false, "sell target card missing"
    end
    if not (G.FUNCS and G.FUNCS.sell_card) then
      return false, "G.FUNCS.sell_card missing"
    end
    local ok, err = pcall(function() G.FUNCS.sell_card(fake_e(card)) end)
    if ok then return true, nil end
    return false, "sell_card error: " .. tostring(err)
  end

  if kind == "use_consumable" then
    local card = card_from_area(G.consumeables, params.index)
    if not card then
      return false, "consumable missing"
    end
    if not (G.FUNCS and G.FUNCS.use_card) then
      return false, "G.FUNCS.use_card missing"
    end
    local ok, err = pcall(function() G.FUNCS.use_card(fake_e(card)) end)
    if ok then return true, nil end
    return false, "use_card error: " .. tostring(err)
  end

  if kind == "pack_select" then
    if not is_pack_state() then
      return false, "not in pack state"
    end
    local card = card_from_area(G.pack_cards, params.pack_index or params.index)
    if not card then
      return false, "pack card missing"
    end
    if not (G.FUNCS and G.FUNCS.use_card) then
      return false, "G.FUNCS.use_card missing"
    end
    local ok, err = pcall(function() G.FUNCS.use_card(fake_e(card)) end)
    if ok then return true, nil end
    return false, "pack use_card error: " .. tostring(err)
  end

  if kind == "pack_skip" then
    if not is_pack_state() then
      return false, "not in pack state"
    end
    if not (G.FUNCS and G.FUNCS.skip_booster) then
      return false, "G.FUNCS.skip_booster missing"
    end
    local ok, err = pcall(function() G.FUNCS.skip_booster({}) end)
    if ok then return true, nil end
    return false, "skip_booster error: " .. tostring(err)
  end

  if kind == "new_run" then
    if not (G.FUNCS and G.FUNCS.start_run) then
      return false, "G.FUNCS.start_run missing"
    end
    -- From menu / game over: start a fresh run at stake 1 (White).
    local ok, err = pcall(function()
      if G.STATE == G.STATES.GAME_OVER then
        G.FUNCS.start_run({ config = { id = "restart_button" } }, {})
      else
        G.FUNCS.start_run(nil, { stake = 1 })
      end
    end)
    if ok then return true, "start_run" end
    return false, "start_run error: " .. tostring(err)
  end

  if kind == "go_to_menu" then
    if not (G.FUNCS and G.FUNCS.go_to_menu) then
      return false, "G.FUNCS.go_to_menu missing"
    end
    local ok, err = pcall(function() G.FUNCS.go_to_menu({}) end)
    if ok then return true, nil end
    return false, "go_to_menu error: " .. tostring(err)
  end

  return false, "unknown kind: " .. tostring(kind)
end

return M
