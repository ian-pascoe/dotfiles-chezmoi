local theme = Util.get_theme()

---@module "lazy"
---@type LazyPluginSpec[]
local M = {
  { -- transparency
    'xiyaowong/transparent.nvim',
    build = ':TransparentEnable',
    lazy = false,
    priority = 1001,
    opts = {
      extra_groups = {
        'NormalFloat',
      },
    },
  },
}

if theme == 'tokyo-night' then
  M = vim.list_extend(M, {
    { -- add tokyonight
      'folke/tokyonight.nvim',
      name = 'tokyonight',
      lazy = false,
      priority = 1000,
      opts = {
        transparent = vim.g.transparent_enabled,
      },
    },
    { -- tell LazyVim to use tokyonight
      'LazyVim/LazyVim',
      opts = { colorscheme = 'tokyonight' },
    },
  })
else
  M = vim.list_extend(M, {
    { -- remove tokyonight if not used
      'folke/tokyonight.nvim',
      name = 'tokyonight',
      enabled = false,
    },
  })
end

if theme == 'catppuccin' then
  M = vim.list_extend(M, {
    { -- add catppuccin
      'catppuccin/nvim',
      name = 'catppuccin',
      lazy = false,
      priority = 1000,
      opts = function(_, opts)
        opts.auto_integrations = true
        opts.transparent_background = vim.g.transparent_enabled
        opts.float = opts.float or {}
        opts.float.transparent = vim.g.transparent_enabled
      end,
    },
    { -- tell LazyVim to use catppuccin
      'LazyVim/LazyVim',
      opts = { colorscheme = 'catppuccin' },
    },
  })
else
  M = vim.list_extend(M, {
    { -- remove catppuccin if not used
      'catppuccin/nvim',
      name = 'catppuccin',
      enabled = false,
    },
  })
end

if theme == 'nord' then
  M = vim.list_extend(M, {
    { -- add nord
      'shaunsingh/nord.nvim',
      name = 'nord',
      lazy = false,
      priority = 1000,
      opts = function()
        vim.g.nord_disable_background = vim.g.transparent_enabled
      end,
      config = function()
        require('nord').set()
      end,
    },
    { -- tell LazyVim to use nord
      'LazyVim/LazyVim',
      opts = { colorscheme = 'nord' },
    },
  })
else
  M = vim.list_extend(M, {
    { -- remove nord if not used
      'shaunsingh/nord.nvim',
      name = 'nord',
      enabled = false,
    },
  })
end

if not theme or theme == 'rose-pine' then
  M = vim.list_extend(M, {
    { -- add rose-pine
      'rose-pine/neovim',
      name = 'rose-pine',
      lazy = false,
      priority = 1000,
      opts = {
        styles = { transparency = vim.g.transparent_enabled },
      },
    },
    { -- tell LazyVim to use rose-pine
      'LazyVim/LazyVim',
      opts = { colorscheme = 'rose-pine' },
    },
  })
else
  M = vim.list_extend(M, {
    { -- remove rose-pine if not used
      'rose-pine/neovim',
      name = 'rose-pine',
      enabled = false,
    },
  })
end

return M
