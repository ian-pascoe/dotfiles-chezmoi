return {
  {
    'nvim-treesitter/nvim-treesitter',
    opts = {
      ensure_installed = { 'groovy' },
    },
  },
  {
    'mason-org/mason.nvim',
    opts = {
      ensure_installed = { 'npm-groovy-lint' },
    },
  },
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      opts.servers = opts.servers or {}

      local classpath = vim.list_extend({
        vim.fn.stdpath('data') .. '/mason/packages/groovy-language-server/build/libs/groovy-language-server-all.jar',
      }, vim.fn.glob(os.getenv('HOME') .. '/.groovy/lib/*.jar', false, true))

      ---@type lazyvim.lsp.Config
      opts.servers.groovyls = {
        cmd = {
          'java',
          '-cp',
          table.concat(classpath, LazyVim.is_win() and ';' or ':'),
          'net.prominic.groovyls.GroovyLanguageServer',
        },
      }

      opts.setup = opts.setup or {}
      -- Not really sure why I have to do this, but the cmd option doesn't seem to be picked up otherwise
      opts.setup.groovyls = function(server, sopts)
        vim.lsp.config(server, sopts)
        vim.lsp.enable(server)
        return true
      end
    end,
  },
}
