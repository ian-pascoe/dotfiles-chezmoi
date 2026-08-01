local Config = require('sidekick.config')
local Util = require('sidekick.util')

---@class sidekick.cli.muxer.Herdr: sidekick.cli.Session
---@field herdr_pane_id string
---@field pending_send? { text: string }
local M = {}
M.__index = M
M.external = true
M.priority = 50

---@param cmd string[]
---@return table?
local function exec_json(cmd)
  local _, stdout = Util.exec(cmd, { notify = false })
  if not stdout then
    return
  end
  local ok, value = pcall(vim.json.decode, stdout)

  if ok and type(value) == 'table' then
    return value
  end
end

function M:is_running()
  local response = exec_json({ 'herdr', 'pane', 'get', self.herdr_pane_id })
  local pane = response and response.result and response.result.pane
  return pane and pane.agent == self.tool.name or false
end

---@return sidekick.cli.session.State[]
function M.sessions()
  local response = exec_json({ 'herdr', 'pane', 'list' })
  local panes = response and response.result and response.result.panes
  if type(panes) ~= 'table' then
    return {}
  end

  local sessions = {} ---@type sidekick.cli.session.State[]
  local tools = Config.tools()
  for _, pane in ipairs(panes) do
    local tool = tools[pane.agent]
    if tool and type(pane.pane_id) == 'string' and type(pane.cwd) == 'string' then
      sessions[#sessions + 1] = {
        id = 'herdr:' .. pane.pane_id,
        cwd = pane.cwd,
        tool = tool,
        herdr_pane_id = pane.pane_id,
        mux_session = pane.pane_id,
      }
    end
  end
  return sessions
end

function M:send(text)
  local pending = { text = text }
  self.pending_send = pending

  vim.schedule(function()
    if self.pending_send == pending then
      self.pending_send = nil
      Util.exec({ 'herdr', 'pane', 'send-text', self.herdr_pane_id, pending.text })
    end
  end)
end

function M:submit()
  local pending = self.pending_send
  self.pending_send = nil

  if pending then
    Util.exec({ 'herdr', 'agent', 'prompt', self.herdr_pane_id, (pending.text:gsub('\n$', '')) })
  else
    Util.exec({ 'herdr', 'pane', 'send-keys', self.herdr_pane_id, 'enter' })
  end
end

function M:dump()
  local _, stdout = Util.exec({
    'herdr',
    'pane',
    'read',
    self.herdr_pane_id,
    '--source',
    'recent',
    '--lines',
    tostring(Config.cli.mux.dump),
    '--format',
    'ansi',
  })
  return stdout
end

return M
