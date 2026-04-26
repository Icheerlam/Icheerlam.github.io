#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web 图形界面 - Adobe Stock 图片识别 + 趋势提示词生成"""

import os
import json
import threading
import time
import webbrowser
from flask import Flask, request, jsonify, send_file, Response

from alibaba_image_recognizer import AlibabaImageRecognizer, TrendAnalyzer

app = Flask(__name__)

# 全局状态
recognize_state = {
    "running": False,
    "total": 0,
    "progress": 0,
    "results": [],
    "log": [],
    "csv_path": None,
    "error": None,
}
recognize_lock = threading.Lock()

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ── HTML 页面 ──────────────────────────────────────────────

HTML_PAGE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Adobe Stock 图片识别工具</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css">
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca' },
      }
    }
  }
}
</script>
<style>
  [x-cloak] { display: none; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
  .tab-active { border-color: #4f46e5; color: #4f46e5; background: #eef2ff; }
  .fade-in { animation: fadeIn .3s ease; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
  .prompt-line { transition: background .15s; }
  .prompt-line:hover { background: #f0f5ff; }
  .log-item { animation: slideIn .2s ease; }
  @keyframes slideIn { from { opacity:0; transform:translateX(-10px) } to { opacity:1; transform:translateX(0) } }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 3px; }
</style>
</head>
<body class="bg-gray-50 min-h-screen">

<!-- 顶栏 -->
<header class="bg-white border-b border-gray-200 shadow-sm">
  <div class="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
    <div class="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
      <i class="fa fa-camera text-white text-lg"></i>
    </div>
    <div>
      <h1 class="text-lg font-bold text-gray-800">Adobe Stock 图片识别工具</h1>
      <p class="text-xs text-gray-400">图片识别 &middot; 趋势分析 &middot; 提示词生成</p>
    </div>
  </div>
</header>

<!-- Tab 导航 -->
<div class="max-w-5xl mx-auto px-6 mt-6">
  <div class="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
    <button onclick="switchTab('prompts')" id="tab-prompts"
      class="tab-btn px-5 py-2.5 rounded-lg text-sm font-medium transition-all tab-active">
      <i class="fa fa-lightbulb-o mr-1.5"></i>提示词生成
    </button>
    <button onclick="switchTab('recognize')" id="tab-recognize"
      class="tab-btn px-5 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-500 hover:text-gray-700">
      <i class="fa fa-image mr-1.5"></i>图片识别
    </button>
  </div>
</div>

<!-- ── 提示词生成面板 ── -->
<div id="panel-prompts" class="max-w-5xl mx-auto px-6 mt-5 fade-in">
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <div class="flex items-end gap-4">
      <div class="flex-1">
        <label class="block text-sm font-medium text-gray-600 mb-1.5">生成数量</label>
        <input id="prompt-count" type="number" value="20" min="1" max="200"
          class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none">
      </div>
      <button onclick="generatePrompts()" id="btn-generate"
        class="px-8 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 shrink-0">
        <i class="fa fa-magic"></i>生成提示词
      </button>
    </div>
  </div>

  <!-- 结果区 -->
  <div id="prompts-result" class="mt-4 hidden">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div class="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <span class="text-sm text-gray-500" id="prompts-count-label"></span>
        <button onclick="copyAllPrompts()"
          class="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          <i class="fa fa-copy"></i>复制全部
        </button>
      </div>
      <div id="prompts-list" class="max-h-[500px] overflow-y-auto divide-y divide-gray-50"></div>
    </div>
  </div>
</div>

<!-- ── 图片识别面板 ── -->
<div id="panel-recognize" class="max-w-5xl mx-auto px-6 mt-5 hidden">
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="bg-gray-50 rounded-xl p-4">
        <div class="text-xs text-gray-400 mb-1">待识别图片</div>
        <div class="text-2xl font-bold text-gray-800" id="images-count">-</div>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1.5">并发线程数</label>
        <input id="workers-count" type="number" value="5" min="1" max="10"
          class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-300 outline-none">
      </div>
    </div>
    <button onclick="startRecognize()" id="btn-recognize"
      class="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2">
      <i class="fa fa-play"></i>开始识别
    </button>
  </div>

  <!-- 进度 -->
  <div id="recognize-progress" class="mt-4 hidden">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-700" id="progress-label">识别中...</span>
        <span class="text-sm text-brand-600 font-bold" id="progress-count">0/0</span>
      </div>
      <div class="w-full bg-gray-100 rounded-full h-2.5">
        <div id="progress-bar" class="bg-brand-500 h-2.5 rounded-full transition-all duration-300" style="width:0%"></div>
      </div>
    </div>

    <!-- 日志 -->
    <div class="mt-3 bg-white rounded-2xl shadow-sm border border-gray-100">
      <div class="px-6 py-3 border-b border-gray-100">
        <span class="text-sm text-gray-500">处理日志</span>
      </div>
      <div id="recognize-log" class="max-h-[300px] overflow-y-auto px-6 py-2 space-y-1"></div>
    </div>
  </div>

  <!-- 结果表格 -->
  <div id="recognize-result" class="mt-4 hidden">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div class="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <span class="text-sm font-medium text-gray-700" id="result-summary"></span>
        <a href="/api/download-csv" id="btn-download"
          class="text-xs bg-green-50 text-green-700 px-4 py-1.5 rounded-lg font-medium hover:bg-green-100 flex items-center gap-1">
          <i class="fa fa-download"></i>下载 CSV
        </a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">#</th>
              <th class="px-4 py-3 text-left">文件名</th>
              <th class="px-4 py-3 text-left">标题</th>
              <th class="px-4 py-3 text-left">分类</th>
              <th class="px-4 py-3 text-left">关键词</th>
            </tr>
          </thead>
          <tbody id="result-table" class="divide-y divide-gray-50"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<footer class="max-w-5xl mx-auto px-6 py-8 text-center text-xs text-gray-300">
  Powered by Alibaba Qwen VL &amp; Qwen Max
</footer>

<script>
// Tab 切换
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('tab-active');
    b.classList.add('text-gray-500');
  });
  document.getElementById('tab-' + tab).classList.add('tab-active');
  document.getElementById('tab-' + tab).classList.remove('text-gray-500');

  document.getElementById('panel-prompts').classList.toggle('hidden', tab !== 'prompts');
  document.getElementById('panel-recognize').classList.toggle('hidden', tab !== 'recognize');

  if (tab === 'recognize') loadImagesCount();
}

// ── 提示词生成 ──
let allPrompts = [];

async function generatePrompts() {
  const count = parseInt(document.getElementById('prompt-count').value) || 20;
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>生成中...';

  try {
    const res = await fetch('/api/generate-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    const data = await res.json();
    allPrompts = data.prompts || [];

    const list = document.getElementById('prompts-list');
    list.innerHTML = '';
    allPrompts.forEach((p, i) => {
      list.innerHTML += '<div class="prompt-line px-6 py-3 text-sm text-gray-700 cursor-pointer flex gap-3" onclick="copyText(this.textContent.trim())">' +
        '<span class="text-gray-300 shrink-0 w-6 text-right">' + (i+1) + '</span>' +
        '<span class="select-all">' + escapeHtml(p) + '</span></div>';
    });

    document.getElementById('prompts-count-label').textContent = '共 ' + allPrompts.length + ' 个提示词';
    document.getElementById('prompts-result').classList.remove('hidden');
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-magic"></i>生成提示词';
  }
}

function copyAllPrompts() {
  navigator.clipboard.writeText(allPrompts.join('\n')).then(() => {
    const btn = event.target.closest('button');
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-check"></i>已复制';
    setTimeout(() => btn.innerHTML = old, 1500);
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

// ── 图片识别 ──
async function loadImagesCount() {
  try {
    const res = await fetch('/api/images-count');
    const data = await res.json();
    document.getElementById('images-count').textContent = data.count;
  } catch (e) {
    document.getElementById('images-count').textContent = '?';
  }
}

let pollTimer = null;

async function startRecognize() {
  const workers = parseInt(document.getElementById('workers-count').value) || 5;
  const btn = document.getElementById('btn-recognize');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>识别中...';
  btn.classList.add('opacity-50');

  document.getElementById('recognize-progress').classList.remove('hidden');
  document.getElementById('recognize-result').classList.add('hidden');
  document.getElementById('recognize-log').innerHTML = '';
  document.getElementById('progress-bar').style.width = '0%';

  try {
    const res = await fetch('/api/start-recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workers })
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error || '启动失败'); return; }

    pollTimer = setInterval(pollProgress, 1500);
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

async function pollProgress() {
  try {
    const res = await fetch('/api/recognize-progress');
    const d = await res.json();

    document.getElementById('progress-count').textContent = d.progress + '/' + d.total;
    const pct = d.total > 0 ? (d.progress / d.total * 100) : 0;
    document.getElementById('progress-bar').style.width = pct + '%';

    // 更新日志（只追加新的）
    const log = document.getElementById('recognize-log');
    const existing = log.children.length;
    for (let i = existing; i < d.log.length; i++) {
      const cls = d.log[i].includes('[OK]') ? 'text-green-600' : d.log[i].includes('[FAIL]') ? 'text-red-500' : 'text-gray-500';
      log.innerHTML += '<div class="log-item text-xs py-1 ' + cls + '">' + escapeHtml(d.log[i]) + '</div>';
    }
    log.scrollTop = log.scrollHeight;

    if (!d.running) {
      clearInterval(pollTimer);
      const btn = document.getElementById('btn-recognize');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-play"></i>开始识别';
      btn.classList.remove('opacity-50');

      if (d.error) {
        document.getElementById('progress-label').textContent = '识别失败';
        alert(d.error);
      } else {
        document.getElementById('progress-label').textContent = '识别完成';
        showResults(d.results);
      }
    }
  } catch (e) {
    console.error('轮询失败', e);
  }
}

function showResults(results) {
  if (!results || !results.length) return;
  const ok = results.filter(r => r.Title).length;
  document.getElementById('result-summary').textContent = '成功 ' + ok + '/' + results.length + ' 张';
  document.getElementById('recognize-result').classList.remove('hidden');

  const categories = __CATEGORIES__;
  const tbody = document.getElementById('result-table');
  tbody.innerHTML = '';
  results.forEach((r, i) => {
    tbody.innerHTML += '<tr class="hover:bg-gray-50">' +
      '<td class="px-4 py-3 text-gray-400">' + (i+1) + '</td>' +
      '<td class="px-4 py-3 text-gray-700 font-medium">' + escapeHtml(r.Filename) + '</td>' +
      '<td class="px-4 py-3 text-gray-600">' + escapeHtml(r.Title) + '</td>' +
      '<td class="px-4 py-3"><span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-xs">' + escapeHtml(categories[r.Category] || r.Category) + '</span></td>' +
      '<td class="px-4 py-3 text-gray-500 text-xs max-w-xs truncate" title="' + escapeHtml(r.Keywords) + '">' + escapeHtml(r.Keywords) + '</td>' +
      '</tr>';
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('panel-recognize').classList.contains('hidden')) {
    loadImagesCount();
  }
});
</script>
</body>
</html>"""


def build_html():
    """构建完整 HTML，注入分类数据"""
    config = load_config()
    categories = config.get("categories", {})
    return HTML_PAGE.replace("__CATEGORIES__", json.dumps(categories, ensure_ascii=False))


# ── Flask 路由 ──────────────────────────────────────────

@app.route("/")
def index():
    return Response(build_html(), mimetype="text/html; charset=utf-8")


@app.route("/api/generate-prompts", methods=["POST"])
def api_generate_prompts():
    data = request.get_json(force=True)
    count = data.get("count", 20)

    config = load_config()
    api_key = config.get("alibaba_api_key", "")
    if not api_key:
        return jsonify({"prompts": [], "error": "缺少 API 密钥"})

    api_url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    analyzer = TrendAnalyzer(api_key, api_url)
    prompts = analyzer.generate_prompts(count)

    return jsonify({"prompts": prompts})


@app.route("/api/images-count")
def api_images_count():
    config = load_config()
    input_folder = config.get("input_folder", "")
    if not os.path.isdir(input_folder):
        return jsonify({"count": 0})

    exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
    count = sum(1 for f in os.listdir(input_folder)
                if os.path.isfile(os.path.join(input_folder, f)) and os.path.splitext(f)[1].lower() in exts)
    return jsonify({"count": count})


@app.route("/api/start-recognize", methods=["POST"])
def api_start_recognize():
    global recognize_state

    with recognize_lock:
        if recognize_state["running"]:
            return jsonify({"ok": False, "error": "已有识别任务在运行"})

        data = request.get_json(force=True) if request.is_json else {}
        workers = data.get("workers", 5)

        recognize_state = {
            "running": True,
            "total": 0,
            "progress": 0,
            "results": [],
            "log": [],
            "csv_path": None,
            "error": None,
        }

        thread = threading.Thread(target=_run_recognize, args=(workers,), daemon=True)
        thread.start()

    return jsonify({"ok": True})


def _run_recognize(workers: int):
    global recognize_state

    try:
        recognizer = AlibabaImageRecognizer(CONFIG_PATH)
        recognizer.max_workers = workers

        images = recognizer.get_images(recognizer.config["input_folder"])
        recognize_state["total"] = len(images)

        if not images:
            recognize_state["running"] = False
            recognize_state["error"] = "没有找到图片"
            return

        from concurrent.futures import ThreadPoolExecutor, as_completed
        from pathlib import Path as _Path

        results = []

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(recognizer._analyze_image, img, i, len(images)): img
                for i, img in enumerate(images, 1)
            }

            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)

                    filename = result.get("Filename", "")
                    status = "[OK]" if result.get("Title") else "[FAIL]"
                    recognize_state["log"].append(f"{filename} {status}")
                except Exception as e:
                    img_path = futures[future]
                    name = _Path(img_path).name
                    recognize_state["log"].append(f"{name} [FAIL]: {e}")

                with recognize_lock:
                    recognize_state["progress"] = len(results)

        # 排序
        results.sort(key=lambda x: images.index(
            next(img for img in images if _Path(img).name == x["Filename"])
        ))

        # 保存 CSV
        csv_path = os.path.join(
            recognizer.config["output_folder"],
            "Sample_Adobe_Stock_CSV_upload.csv"
        )
        recognizer.save_to_csv(results, csv_path)

        with recognize_lock:
            recognize_state["results"] = results
            recognize_state["csv_path"] = csv_path
            recognize_state["running"] = False

    except Exception as e:
        with recognize_lock:
            recognize_state["error"] = str(e)
            recognize_state["running"] = False


@app.route("/api/recognize-progress")
def api_recognize_progress():
    with recognize_lock:
        state = recognize_state.copy()
    return jsonify(state)


@app.route("/api/download-csv")
def api_download_csv():
    with recognize_lock:
        csv_path = recognize_state.get("csv_path")

    if csv_path and os.path.exists(csv_path):
        return send_file(csv_path, as_attachment=True, mimetype="text/csv; charset=utf-8-sig")

    return "CSV 文件不存在", 404


# ── 入口 ────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("Adobe Stock 图片识别工具 - Web 界面")
    print("=" * 50)
    print()
    print("浏览器打开: http://localhost:5000")
    print("按 Ctrl+C 停止服务")
    print()

    webbrowser.open("http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
