local function get_vaults()
  local workspaces = {}

  local vaults_path = vim.fn.finddir('vaults', os.getenv('HOME'))
  if vaults_path == '' then
    return workspaces
  end

  local personal_vault_name = 'personal'
  local personal_vault_path = vim.fn.finddir(personal_vault_name, vaults_path)
  if personal_vault_path ~= '' then
    workspaces = vim.list_extend(workspaces, {
      {
        name = personal_vault_name,
        path = personal_vault_path,
      },
    })
  end

  local family_vault_name = 'family'
  local family_vault_path = vim.fn.finddir(family_vault_name, vaults_path)
  if family_vault_path ~= '' then
    workspaces = vim.list_extend(workspaces, {
      {
        name = family_vault_name,
        path = family_vault_path,
      },
    })
  end

  local work_vault_name = 'work'
  local work_vault_path = vim.fn.finddir(work_vault_name, vaults_path)
  if work_vault_path ~= '' then
    workspaces = vim.list_extend(workspaces, {
      {
        name = work_vault_name,
        path = work_vault_path,
      },
    })
  end

  return workspaces
end

local vault_workspaces = get_vaults()

return {
  {
    'folke/snacks.nvim',
    ---@module "snacks"
    ---@type snacks.Config
    opts = {
      explorer = {
        enabled = false, -- disable built-in file explorer
      },
      picker = {
        sources = { -- show hidden files in pickers
          files = { hidden = true },
          grep = { hidden = true },
          explorer = { hidden = true },
        },
      },
    },
    keys = {
      {
        '<leader>fd',
        function()
          require('snacks').picker.files({
            cwd = LazyVim.root(),
            hidden = true,
            follow = true,
            cmd = 'fd',
            args = { '--type', 'd' },
            transform = function(entry)
              return vim.fn.isdirectory(entry.file) == 1
            end,
          })
        end,
        desc = 'Find directories',
      },
      {
        '<leader>fD',
        function()
          require('snacks').picker.files({
            cwd = vim.fn.getcwd(),
            hidden = true,
            follow = true,
            cmd = 'fd',
            args = { '--type', 'd' },
            transform = function(entry)
              return vim.fn.isdirectory(entry.file) == 1
            end,
          })
        end,
        desc = 'Find directories (cwd)',
      },
    },
  },
  { -- better file explorer
    'stevearc/oil.nvim',
    dependencies = { 'nvim-mini/mini.icons' },
    lazy = false,
    ---@module "oil"
    ---@type oil.setupOpts
    opts = {
      delete_to_trash = true,
      view_options = {
        show_hidden = true,
        is_always_hidden = function(name)
          -- always hide .git directory
          if name:match('^%.git$') then
            return true
          end
          return false
        end,
      },
    },
    keys = {
      {
        '-',
        function()
          require('oil').open()
        end,
        desc = 'File Explorer',
      },
      {
        '<leader>e',
        function()
          require('oil').open(LazyVim.root())
        end,
        desc = 'Explorer oil (root dir)',
      },
      {
        '<leader>E',
        function()
          require('oil').open(vim.fn.getcwd())
        end,
        desc = 'Explorer oil (cwd)',
      },
    },
  },
  { -- neogit
    'NeogitOrg/neogit',
    cmd = 'Neogit',
    dependencies = {
      'nvim-lua/plenary.nvim',
      'sindrets/diffview.nvim', -- diff integration
      'folke/snacks.nvim', -- picker integration
    },
    opts = {},
    keys = {
      {
        '<leader>gg',
        function()
          require('neogit').open({ cwd = LazyVim.root.git() })
        end,
        desc = 'Neogit',
      },
      {
        '<leader>gG',
        function()
          require('neogit').open({ cwd = vim.fn.getcwd() })
        end,
        desc = 'Neogit (cwd)',
      },
    },
  },
  { -- yazi
    'mikavilpas/yazi.nvim',
    cmd = 'Yazi',
    dependencies = { 'nvim-lua/plenary.nvim' },
    ---@module "yazi"
    ---@type YaziConfig
    opts = {
      open_for_directories = true,
    },
    keys = {
      { '<leader>y', '<cmd>Yazi<cr>', desc = 'yazi' },
      { '<leader>Y', '<cmd>Yazi cwd<cr>', desc = 'yazi (cwd)' },
    },
  },
  {
    'epwalsh/obsidian.nvim',
    enabled = vault_workspaces ~= nil and #vault_workspaces > 0,
    ft = { 'markdown' },
    dependencies = {
      'nvim-lua/plenary.nvim',
    },
    opts = function(_, opts)
      opts.workspaces = vault_workspaces
    end,
  },
  { -- Directory diffing plugin
    'will133/vim-dirdiff',
    cmd = 'DirDiff',
    opts = {},
  },
}
