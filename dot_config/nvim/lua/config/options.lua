-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- enable prettier only if a config file is present in the project
vim.g.lazyvim_prettier_needs_config = true

-- use pwsh as terminal on windows
if LazyVim.is_win() then
  if vim.fn.executable('pwsh') == 1 then
    vim.opt.shell = 'pwsh'
  else
    vim.opt.shell = 'powershell'
  end

  vim.opt.shellcmdflag =
    '-NoLogo -NoProfile -ExecutionPolicy RemoteSigned -Command [Console]::InputEncoding=[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;'
  vim.opt.shellredir = '-RedirectStandardOutput %s -NoNewWindow -Wait'
  vim.opt.shellpipe = '2>&1 | Out-File -Encoding UTF8 %s; exit $LastExitCode'
  vim.opt.shellquote = ''
  vim.opt.shellxquote = ''
end

-- enable line wrap
vim.opt.wrap = true

-- change listchars
vim.opt.listchars = {
  tab = '→ ',
  extends = '»',
  precedes = '«',
  trail = '·',
  nbsp = '␣',
}
