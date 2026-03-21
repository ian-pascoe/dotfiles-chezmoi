vim.uv = vim.uv or vim.loop

-- Global Utilities
Util = require('util')

-- Enable the module loader
vim.loader.enable()

-- bootstrap lazy.nvim, LazyVim and your plugins
require('config.lazy')
