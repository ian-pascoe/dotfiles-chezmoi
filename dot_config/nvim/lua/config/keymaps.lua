-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- Add keymap to search neovim config files
vim.keymap.set('n', '<leader>sN', LazyVim.pick('files', { cwd = vim.fn.stdpath('config') }), { desc = 'Neovim config' })
