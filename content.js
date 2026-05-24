(function () {
  'use strict';

  // 仅处理 Chrome 默认渲染的纯文本 .md 页面：body 通常是单个 <pre>
  const pre = document.body && document.body.firstElementChild;
  const isPlainTextPage =
    document.contentType === 'text/plain' ||
    document.contentType === 'text/markdown' ||
    (pre && pre.tagName === 'PRE' && document.body.children.length === 1);

  if (!isPlainTextPage) return;

  const rawMarkdown = (pre && pre.textContent) || document.body.innerText || '';
  if (!rawMarkdown.trim()) return;

  // ---------- markdown-it 配置 ----------
  const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: false,
    breaks: false,
    highlight(code, lang) {
      if (lang === 'mermaid') {
        return `<pre class="mermaid-pre"><code class="language-mermaid">${escapeHtml(code)}</code></pre>`;
      }
      if (lang && window.hljs && window.hljs.getLanguage(lang)) {
        try {
          return (
            '<pre class="hljs"><code class="language-' +
            lang +
            '">' +
            window.hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
            '</code></pre>'
          );
        } catch (_) {}
      }
      return (
        '<pre class="hljs"><code>' +
        (window.hljs ? window.hljs.highlightAuto(code).value : escapeHtml(code)) +
        '</code></pre>'
      );
    },
  });

  if (window.markdownitTaskLists) {
    md.use(window.markdownitTaskLists, { enabled: true, label: true });
  }

  md.renderer.rules.heading_open = function (tokens, idx) {
    const token = tokens[idx];
    const next = tokens[idx + 1];
    const text = next && next.type === 'inline' ? next.content : '';
    const slug = slugify(text);
    token.attrSet('id', slug);
    return (
      '<' +
      token.tag +
      ' id="' +
      slug +
      '"><a class="anchor" href="#' +
      slug +
      '" aria-hidden="true">#</a>'
    );
  };

  // ---------- 初次渲染 + DOM 骨架 ----------
  const initialHtml = md.render(rawMarkdown);
  const title = (rawMarkdown.match(/^#\s+(.+)$/m) || [, ''])[1].trim() || document.title;
  document.title = title;

  if (!document.querySelector('meta[charset]')) {
    const meta = document.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    document.head.insertBefore(meta, document.head.firstChild);
  }

  document.body.innerHTML = `
    <div id="md-toolbar">
      <span class="md-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
      <div class="md-actions">
        <button id="md-toggle-toc" title="目录 (T)">⊟ 目录</button>
        <label class="md-theme-label">
          <span>主题</span>
          <select id="md-theme-pack" title="切换主题 (D)">
            <option value="light">默认浅色</option>
            <option value="dark">默认深色</option>
            <option value="morandi">Morandi Garden</option>
          </select>
        </label>
        <button id="md-toggle-edit" title="编辑 (E)">✎ 编辑</button>
        <button id="md-toggle-raw" title="查看原文 (R)">⟨/⟩ 原文</button>
        <button id="md-save" title="保存 (Ctrl+S)" hidden>💾 保存</button>
        <button id="md-print" title="打印 / 导出 PDF (Ctrl+P)">⎙ 打印</button>
      </div>
    </div>
    <div id="md-layout">
      <aside id="md-toc"></aside>
      <section id="md-editor" hidden>
        <textarea id="md-editor-input" spellcheck="false"></textarea>
      </section>
      <main class="markdown-body" id="md-content">${initialHtml}</main>
      <pre id="md-raw" hidden></pre>
    </div>
    <div id="md-toast" hidden></div>
  `;

  // ---------- 全局引用缓存 ----------
  const contentNode = document.getElementById('md-content');
  const rawNode = document.getElementById('md-raw');
  const tocNode = document.getElementById('md-toc');
  const editorSection = document.getElementById('md-editor');
  const editorInput = document.getElementById('md-editor-input');
  const themeSelect = document.getElementById('md-theme-pack');
  const editBtn = document.getElementById('md-toggle-edit');
  const rawBtn = document.getElementById('md-toggle-raw');
  const saveBtn = document.getElementById('md-save');
  const toastNode = document.getElementById('md-toast');

  rawNode.textContent = rawMarkdown;
  editorInput.value = rawMarkdown;

  // ---------- 当前文档状态 ----------
  let currentMarkdown = rawMarkdown;
  let dirty = false;
  let editMode = false;
  let mermaidInitialized = false;

  // 初始化 side-effect passes（一次性即可，后续 renderTo 调用是幂等的）
  addCodeFenceWrappers(contentNode);
  addMdTaskListClass(contentNode);
  addCopyButtons(contentNode);
  addImageLightbox(contentNode);
  renderKatex(contentNode);
  buildToc(contentNode);
  initMermaid();
  mermaidInitialized = true;

  // ---------- 主题包：light / dark / morandi ----------
  const PACKS = ['light', 'dark', 'morandi'];
  const themeMQ = window.matchMedia('(prefers-color-scheme: dark)');

  // 迁移旧 key
  let storedPack = localStorage.getItem('md-viewer-theme-pack');
  if (!storedPack) {
    const legacy = localStorage.getItem('md-viewer-theme');
    if (legacy === 'light' || legacy === 'dark') storedPack = legacy;
  }
  let currentPack =
    PACKS.indexOf(storedPack) >= 0 ? storedPack : themeMQ.matches ? 'dark' : 'light';

  themeSelect.value = currentPack;
  applyThemePack(currentPack);

  themeMQ.addEventListener('change', () => {
    if (!localStorage.getItem('md-viewer-theme-pack')) {
      currentPack = themeMQ.matches ? 'dark' : 'light';
      themeSelect.value = currentPack;
      applyThemePack(currentPack);
    }
  });

  themeSelect.addEventListener('change', () => {
    currentPack = themeSelect.value;
    localStorage.setItem('md-viewer-theme-pack', currentPack);
    applyThemePack(currentPack);
  });

  function applyThemePack(pack) {
    // 数据属性
    document.documentElement.dataset.themePack = pack === 'morandi' ? 'morandi' : 'default';
    document.documentElement.dataset.theme = pack === 'dark' ? 'dark' : 'light';

    // 清掉先前注入的主题包 link
    document.querySelectorAll('link[data-theme-pack-link]').forEach((n) => n.remove());

    // 切换 hljs 主题
    document.querySelectorAll('link[data-hljs]').forEach((n) => n.remove());
    const hljsLink = document.createElement('link');
    hljsLink.rel = 'stylesheet';
    hljsLink.dataset.hljs = '1';
    hljsLink.href = chrome.runtime.getURL(
      pack === 'dark' ? 'lib/highlight-github-dark.css' : 'lib/highlight-github.css'
    );
    document.head.appendChild(hljsLink);

    // github-markdown.css 启停
    const ghLink = findStylesheetLink('github-markdown.css');
    if (ghLink) ghLink.disabled = pack === 'morandi';

    // Morandi 注入
    if (pack === 'morandi') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.themePackLink = 'morandi';
      link.href = chrome.runtime.getURL('themes/morandigarden/morandigarden.css');
      document.head.appendChild(link);
    }

    applyDomCompat(pack);
  }

  function applyDomCompat(pack) {
    // Morandi 主题使用 #write 选择器；切到 morandi 时把内容 id 改成 write，否则恢复
    contentNode.id = pack === 'morandi' ? 'write' : 'md-content';
  }

  function findStylesheetLink(hrefSuffix) {
    return Array.from(document.querySelectorAll('link[rel=stylesheet]')).find((l) =>
      (l.getAttribute('href') || '').endsWith(hrefSuffix)
    );
  }

  // ---------- TOC ----------
  function buildToc(root) {
    tocNode.innerHTML = '';
    const headings = root.querySelectorAll('h1, h2, h3, h4');
    if (headings.length < 2) {
      document.body.classList.add('no-toc');
      return;
    }
    document.body.classList.remove('no-toc');
    const ul = document.createElement('ul');
    headings.forEach((h) => {
      const li = document.createElement('li');
      li.className = 'toc-' + h.tagName.toLowerCase();
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.replace(/^#\s*/, '');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(h.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + h.id);
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
    tocNode.appendChild(ul);
  }

  document.getElementById('md-toggle-toc').addEventListener('click', () => {
    document.body.classList.toggle('toc-hidden');
  });

  // ---------- Raw / 渲染切换 ----------
  rawBtn.addEventListener('click', () => {
    const showRaw = rawNode.hasAttribute('hidden');
    if (showRaw) {
      rawNode.textContent = currentMarkdown;
      rawNode.removeAttribute('hidden');
      contentNode.setAttribute('hidden', '');
    } else {
      contentNode.removeAttribute('hidden');
      rawNode.setAttribute('hidden', '');
    }
  });

  // ---------- 打印 ----------
  document.getElementById('md-print').addEventListener('click', () => window.print());

  // ---------- 编辑模式 ----------
  editBtn.addEventListener('click', () => toggleEditMode());

  function toggleEditMode() {
    editMode ? exitEditMode() : enterEditMode();
  }

  function enterEditMode() {
    editMode = true;
    document.body.classList.add('edit-mode');
    // 强制把右侧渲染区显示出来，隐藏 raw（避免先前点过原文(R)导致两边都是文本）
    rawNode.setAttribute('hidden', '');
    contentNode.removeAttribute('hidden');
    editorSection.removeAttribute('hidden');
    saveBtn.removeAttribute('hidden');
    rawBtn.setAttribute('hidden', '');
    editBtn.textContent = '✕ 退出编辑';
    editorInput.value = currentMarkdown;
    // 确保预览反映当前 markdown（防止状态不一致）
    renderTo(currentMarkdown, { skipMermaid: true });
    requestAnimationFrame(() => editorInput.focus());
  }

  function exitEditMode() {
    if (dirty) {
      const ok = window.confirm('有未保存的修改。是否放弃修改并退出编辑？');
      if (!ok) return;
    }
    editMode = false;
    document.body.classList.remove('edit-mode');
    editorSection.setAttribute('hidden', '');
    saveBtn.setAttribute('hidden', '');
    rawBtn.removeAttribute('hidden');
    editBtn.textContent = '✎ 编辑';
    dirty = false;
    // 退出编辑后重新跑一次 Mermaid（编辑期跳过的）
    initMermaid();
  }

  editorInput.addEventListener(
    'input',
    debounce(() => {
      currentMarkdown = editorInput.value;
      dirty = true;
      renderTo(currentMarkdown, { skipMermaid: true });
    }, 200)
  );

  // Tab 键插入两个空格（保留 undo 栈）
  editorInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  });

  // 离开页面时拦截脏数据
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- 渲染管线（幂等） ----------
  function renderTo(markdown, opts) {
    opts = opts || {};
    const html = md.render(markdown);
    contentNode.innerHTML = html;
    rawNode.textContent = markdown;

    addCodeFenceWrappers(contentNode);
    addMdTaskListClass(contentNode);
    addCopyButtons(contentNode);
    addImageLightbox(contentNode);
    renderKatex(contentNode);
    buildToc(contentNode);

    if (!opts.skipMermaid) {
      initMermaid();
      mermaidInitialized = true;
    }
  }

  function addCodeFenceWrappers(root) {
    root.querySelectorAll('pre.hljs').forEach((preEl) => {
      if (preEl.parentElement && preEl.parentElement.classList.contains('md-fences')) return;
      const codeEl = preEl.querySelector('code');
      let lang = '';
      if (codeEl) {
        const m = (codeEl.className || '').match(/language-([\w+-]+)/);
        if (m) lang = m[1];
      }
      const wrap = document.createElement('div');
      wrap.className = 'md-fences';
      if (lang) wrap.setAttribute('lang', lang);
      preEl.parentNode.insertBefore(wrap, preEl);
      wrap.appendChild(preEl);
    });
  }

  function addMdTaskListClass(root) {
    root.querySelectorAll('li.task-list-item').forEach((li) => {
      li.classList.add('md-task-list-item');
    });
  }

  function addCopyButtons(root) {
    root.querySelectorAll('pre.hljs').forEach((preEl) => {
      if (preEl.querySelector('.md-copy')) return;
      const btn = document.createElement('button');
      btn.className = 'md-copy';
      btn.textContent = '复制';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(preEl.innerText.replace(/\n复制$/, ''));
          btn.textContent = '✓ 已复制';
          setTimeout(() => (btn.textContent = '复制'), 1500);
        } catch (_) {
          btn.textContent = '失败';
        }
      });
      preEl.appendChild(btn);
    });
  }

  function addImageLightbox(root) {
    root.querySelectorAll('img').forEach((img) => {
      if (img.dataset.mdLightboxBound) return;
      img.dataset.mdLightboxBound = '1';
      img.loading = 'lazy';
      img.addEventListener('click', () => {
        const overlay = document.createElement('div');
        overlay.className = 'md-lightbox';
        overlay.innerHTML = `<img src="${img.src}" alt="">`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
      });
    });
  }

  function renderKatex(root) {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  }

  // ---------- Mermaid ----------
  function initMermaid() {
    const placeholders = contentNode.querySelectorAll('pre.mermaid-pre');
    placeholders.forEach((preEl) => {
      const code = preEl.querySelector('code').textContent;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = code;
      preEl.replaceWith(div);
    });

    const unprocessed = contentNode.querySelectorAll('.mermaid:not([data-processed])');
    if (unprocessed.length === 0) return;

    const dark = document.documentElement.dataset.theme === 'dark';
    const url = chrome.runtime.getURL('lib/mermaid.min.js');
    const script = document.createElement('script');
    script.textContent = `
      (async () => {
        if (!window.__mermaidLoaded) {
          const resp = await fetch(${JSON.stringify(url)});
          const code = await resp.text();
          const blob = new Blob([code], { type: 'text/javascript' });
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = URL.createObjectURL(blob);
            s.onload = () => { window.__mermaidLoaded = true; res(); };
            s.onerror = rej;
            document.documentElement.appendChild(s);
          });
        }
        if (window.mermaid) {
          window.mermaid.initialize({
            startOnLoad: false,
            theme: ${dark ? "'dark'" : "'default'"},
            securityLevel: 'loose',
          });
          try {
            await window.mermaid.run({ querySelector: '#md-content .mermaid:not([data-processed]), #write .mermaid:not([data-processed])' });
          } catch (e) { console.warn('mermaid render failed', e); }
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  }

  // ---------- 保存 ----------
  saveBtn.addEventListener('click', () => saveMarkdown(currentMarkdown));

  function saveMarkdown(text) {
    const filename = deriveFilename(location.href);
    try {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      if (chrome && chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download({ url, filename, saveAs: true }, () => {
          if (chrome.runtime.lastError) {
            console.warn('downloads.download failed', chrome.runtime.lastError);
            fallbackDownload(url, filename);
          } else {
            dirty = false;
            showToast('已保存：' + filename);
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        });
      } else {
        fallbackDownload(url, filename);
        dirty = false;
        showToast('已触发下载：' + filename);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      console.error('save failed', e);
      showToast('保存失败：' + (e && e.message ? e.message : e));
    }
  }

  function fallbackDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function deriveFilename(href) {
    try {
      const u = new URL(href);
      const last = u.pathname.split('/').filter(Boolean).pop() || 'untitled.md';
      let name = decodeURIComponent(last);
      // 安全过滤
      name = name.replace(/[\\:*?"<>|]/g, '_');
      if (!/\.(md|markdown|MD)$/i.test(name)) name += '.md';
      return name;
    } catch (_) {
      return 'untitled.md';
    }
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    toastNode.textContent = msg;
    toastNode.removeAttribute('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.setAttribute('hidden', ''), 1800);
  }

  // ---------- 键盘快捷键 ----------
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+S 总是拦截
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      if (editMode) {
        e.preventDefault();
        saveMarkdown(currentMarkdown);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    // 编辑框内不响应字母快捷键
    if (/INPUT|TEXTAREA|SELECT/i.test(tag)) return;
    if (e.key === 't' || e.key === 'T') document.getElementById('md-toggle-toc').click();
    else if (e.key === 'd' || e.key === 'D') {
      const idx = PACKS.indexOf(currentPack);
      const next = PACKS[(idx + 1) % PACKS.length];
      themeSelect.value = next;
      currentPack = next;
      localStorage.setItem('md-viewer-theme-pack', next);
      applyThemePack(next);
    } else if (e.key === 'e' || e.key === 'E') toggleEditMode();
    else if (e.key === 'r' || e.key === 'R') rawBtn.click();
  });

  // ---------- 锚点跳转 ----------
  if (location.hash) {
    requestAnimationFrame(() => {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) el.scrollIntoView();
    });
  }

  // ---------- 辅助函数 ----------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s]+/g, '-')
      .replace(/[^\w一-龥-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
})();
