return {
  {
    'folke/sidekick.nvim',
    ---@module "sidekick"
    ---@type sidekick.Config
    opts = {
      nes = {
        enabled = false,
      },
      copilot = {
        status = {
          enabled = false,
        },
      },
      cli = {
        tools = {
          omp = {
            cmd = { 'omp' },
            is_proc = '\\<omp\\>',
            resume = { '--resume' },
            continue = { '--continue' },
            url = 'https://omp.sh',
            native_scroll = false,
          },
        },
      },
    },
    config = function(_, opts)
      require('sidekick').setup(opts)
      if vim.env.HERDR_ENV == '1' and vim.fn.executable('herdr') == 1 then
        require('sidekick.cli.session').register('herdr', require('config.sidekick_herdr'))
      end
    end,
  },
  {
    'milanglacier/minuet-ai.nvim',
    opts = {
      provider = 'openai_compatible',
      request_timeout = 10,
      n_completions = 3,
      throttle = 1500, -- Increase to reduce costs and avoid rate limits
      debounce = 600, -- Increase to reduce costs and avoid rate limits
      provider_options = {
        openai_compatible = {
          api_key = function()
            local key = vim.env.OPENCODE_API_KEY
            if key and key ~= '' then
              return key
            end
            for _, path in ipairs({
              vim.fn.expand('~/.pi/agent/auth.json'),
              vim.fn.expand('~/.local/share/opencode/auth.json'),
            }) do
              local ok, auth = pcall(function()
                return vim.json.decode(table.concat(vim.fn.readfile(path), '\n'))
              end)
              key = ok and auth['opencode-go'] and auth['opencode-go'].key
              if key and key ~= '' then
                return key
              end
            end
            return ''
          end,
          end_point = 'https://opencode.ai/zen/go/v1/chat/completions',
          model = 'deepseek-v4.1-flash',
          name = 'OpenCode Go',
          optional = {
            max_tokens = 56,
            thinking = { type = 'disabled' },
          },
        },
      },
    },
  },
  {
    'saghen/blink.cmp',
    optional = true,
    opts = {
      sources = {
        default = { 'minuet' },
        providers = {
          minuet = {
            name = 'minuet',
            module = 'minuet.blink',
            async = true,
            score_offset = 100,
          },
        },
      },
      completion = { trigger = { prefetch_on_insert = false } },
    },
  },
  {
    'nvim-lualine/lualine.nvim',
    optional = true,
    event = 'VeryLazy',
    opts = function(_, opts)
      table.insert(opts.sections.lualine_x, 2, {
        require('minuet.lualine'),
        icon = '󰚩',
      })
    end,
  },
}
