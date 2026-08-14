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

local theme_specs = {
  ['tokyo-night'] = {
    repo = 'folke/tokyonight.nvim',
    name = 'tokyonight',
    colorscheme = 'tokyonight',
    opts = {
      transparent = vim.g.transparent_enabled,
    },
  },
  catppuccin = {
    repo = 'catppuccin/nvim',
    name = 'catppuccin',
    colorscheme = 'catppuccin',
    opts = function(_, opts)
      opts.auto_integrations = true
      opts.transparent_background = vim.g.transparent_enabled
      opts.float = opts.float or {}
      opts.float.transparent = vim.g.transparent_enabled
    end,
  },
  nord = {
    repo = 'shaunsingh/nord.nvim',
    name = 'nord',
    colorscheme = 'nord',
    opts = function()
      vim.g.nord_disable_background = vim.g.transparent_enabled
    end,
    config = function()
      require('nord').set()
    end,
  },
  ['rose-pine'] = {
    repo = 'rose-pine/neovim',
    name = 'rose-pine',
    colorscheme = 'rose-pine',
    opts = {
      styles = { transparency = vim.g.transparent_enabled },
    },
  },
  gruvbox = {
    repo = 'ellisonleao/gruvbox.nvim',
    name = 'gruvbox',
    colorscheme = 'gruvbox',
    opts = {
      transparent_mode = vim.g.transparent_enabled,
      contrast = 'medium',
    },
  },
  kanagawa = {
    repo = 'rebelot/kanagawa.nvim',
    name = 'kanagawa',
    colorscheme = 'kanagawa',
    opts = {
      transparent = vim.g.transparent_enabled,
    },
  },
  everforest = {
    repo = 'sainnhe/everforest',
    name = 'everforest',
    colorscheme = 'everforest',
    config = function()
      vim.g.everforest_background = 'medium'
      vim.g.everforest_transparent_background = vim.g.transparent_enabled and 1 or 0
    end,
  },
  dracula = {
    repo = 'Mofiqul/dracula.nvim',
    name = 'dracula',
    colorscheme = 'dracula',
    opts = {
      transparent_bg = vim.g.transparent_enabled,
    },
  },
  solarized = {
    repo = 'maxmx03/solarized.nvim',
    name = 'solarized',
    colorscheme = 'solarized',
    opts = {},
    config = function(_, opts)
      vim.o.termguicolors = true
      vim.o.background = 'dark'
      require('solarized').setup(opts)
    end,
  },
  ['one-dark'] = {
    repo = 'navarasu/onedark.nvim',
    name = 'onedark',
    colorscheme = 'onedark',
    config = function()
      require('onedark').setup({
        style = 'dark',
        transparent = vim.g.transparent_enabled,
      })
      require('onedark').load()
    end,
  },
  vesper = {
    repo = 'datsfilipe/vesper.nvim',
    name = 'vesper',
    colorscheme = 'vesper',
    config = function()
      require('vesper').setup({
        transparent = vim.g.transparent_enabled,
      })
    end,
  },
  flexoki = {
    repo = 'kepano/flexoki-neovim',
    name = 'flexoki',
    colorscheme = 'flexoki-dark',
  },
}

local active_theme = theme_specs[theme] and theme or 'rose-pine'
local active_spec = theme_specs[active_theme]

for theme_name, spec in pairs(theme_specs) do
  table.insert(M, {
    spec.repo,
    name = spec.name,
    enabled = theme_name == active_theme,
    lazy = false,
    priority = 1000,
    opts = spec.opts,
    config = spec.config,
  })
end

table.insert(M, {
  'LazyVim/LazyVim',
  opts = { colorscheme = active_spec.colorscheme },
})

return M
