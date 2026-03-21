return {
  {
    'zbirenbaum/copilot.lua',
    optional = true,
    opts = {
      filetypes = {
        -- override defaults --
        yaml = true,
        markdown = true,
        help = true,
        gitcommit = true,
        gitrebase = true,
        hgcommit = true,
        svn = true,
        cvs = true,
        ['.'] = true,
        -----------------------
        ['*'] = true,
        sh = function()
          -- disable for .env files
          if string.match(vim.fs.basename(vim.api.nvim_buf_get_name(0)), '^%.env.*') then
            return false
          end
          return true
        end,
      },
    },
  },
}
