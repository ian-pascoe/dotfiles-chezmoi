return {
  {
    'mason-org/mason.nvim',
    opts = {
      ensure_installed = { 'selene' },
    },
  },
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      opts.servers = opts.servers or {}

      ---@module "lazyvim"
      ---@type lazyvim.lsp.Config
      opts.servers.lua_ls = opts.servers.lua_ls or {}

      -- Use local lua-language-server if it exists
      local local_lsp = vim.fn.expand(os.getenv('HOME') .. '/code/lua-language-server/bin/lua-language-server')
      if vim.fn.executable(local_lsp) == 1 then
        opts.servers.lua_ls.cmd = { local_lsp }
      end
    end,
  },
}
