---@diagnostic disable: inject-field
if lazyvim_docs then
  vim.g.lazyvim_prettier_needs_config = true
end

local supported = {
  'angular',
  'css',
  'ember',
  'graphql',
  'handlebars',
  'html',
  'javascript',
  'javascriptreact',
  'json',
  'jsonc',
  'less',
  'markdown',
  'markdown.mdx',
  'scss',
  'typescript',
  'typescriptreact',
  'vue',
  'yaml',
}

return {
  {
    'neovim/nvim-lspconfig',
    opts = {
      ---@type table<string, vim.lsp.Config>
      servers = {
        oxfmt = {
          enabled = vim.fn.executable('oxfmt') == 1,
          cmd = { 'oxfmt', '--lsp' },
          mason = false,
        },
      },
    },
  },
  {
    'stevearc/conform.nvim',
    optional = true,
    opts = function(_, opts)
      opts.formatters_by_ft = opts.formatters_by_ft or {}
      for _, ft in ipairs(supported) do
        opts.formatters_by_ft[ft] = opts.formatters_by_ft[ft] or {}
        table.insert(opts.formatters_by_ft[ft], 'oxfmt')
      end

      opts.formatters = opts.formatters or {}
      opts.formatters.oxfmt = {
        condition = function(_, ctx)
          return vim.fs.find({ '.oxfmtrc.json' }, {
            path = ctx.filename,
            upward = true,
          })[1]
        end,
      }
    end,
  },
}
