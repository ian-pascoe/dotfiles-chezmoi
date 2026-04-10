---@class util
local M = {}

function M.is_win()
  return vim.uv.os_uname().sysname:find('Windows') ~= nil
end

function M.get_theme()
  local theme = 'rose-pine'
  local currentThemePath = os.getenv('XDG_CONFIG_HOME') .. '/theme'
  local target = vim.uv.fs_readlink(currentThemePath)
  if not target then
    return theme
  end

  theme = vim.fn.fnamemodify(target, ':t')
  return theme
end

return M
