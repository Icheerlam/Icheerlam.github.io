#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
阿里云通义千问VL - 图片识别程序（并发版本）
识别文件夹中的图片并输出CSV（符合Adobe Stock格式）
"""

import os
import json
import csv
import re
import base64
import requests
from pathlib import Path
from typing import Dict, List, Optional
from PIL import Image
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


class AlibabaImageRecognizer:
    """阿里云图片识别器"""

    def __init__(self, config_path: str = "config.json"):
        """初始化配置"""
        self.config = self._load_config(config_path)
        self.supported_formats = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}

        # 阿里云API配置
        self.api_key = self.config.get("alibaba_api_key", "")
        if not self.api_key:
            raise ValueError("配置文件中缺少 alibaba_api_key，请先配置阿里云API密钥")

        self.api_url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

        # 并发数（默认3，可在config中配置）
        self.max_workers = self.config.get("max_workers", 3)

        # 构建分类列表（只构建一次）
        self.categories_list = "\n".join([
            f"{k}. {v}" for k, v in self.config["categories"].items()
        ])

        # 进度计数器
        self.progress_counter = 0
        self.progress_lock = threading.Lock()

    def _load_config(self, config_path: str) -> Dict:
        """加载配置文件"""
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"配置文件 {config_path} 不存在")
            raise
        except json.JSONDecodeError as e:
            print(f"配置文件格式错误: {e}")
            raise

    def _encode_image(self, image_path: str) -> str:
        """将图片编码为base64，如果太大则压缩"""
        try:
            img = Image.open(image_path)

            # 转换为RGB
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # 计算目标尺寸（保持宽高比，最大边长800像素 - 减小尺寸加快速度）
            max_dimension = 800
            if max(img.size) > max_dimension:
                ratio = max_dimension / max(img.size)
                new_size = tuple(int(dim * ratio) for dim in img.size)
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            # 压缩为JPEG，质量75 - 降低质量加快编码
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=75, optimize=True)
            compressed_data = output.getvalue()

            return base64.b64encode(compressed_data).decode("utf-8")

        except Exception as e:
            print(f"图片编码失败: {e}")
            raise

    def _analyze_image(self, image_path: str, index: int, total: int) -> Dict:
        """调用阿里云API分析图片"""
        filename = Path(image_path).name

        try:
            # 编码图片
            base64_image = self._encode_image(image_path)

            # 构建提示词
            prompt = f"""Please carefully observe this image and accurately describe what you see.

Important:
- Must be based on actual image content
- Do not guess or fabricate content that doesn't exist in the image
- If image quality is poor, describe only what is visible
- **All output must be in English**

Please provide:
1. title: A concise title in English describing the main content (20-50 characters)
2. keywords: Up to 49 specific English keywords extracted from the image (objects, scenes, actions, colors, emotions, composition, style, lighting, etc.)
3. category: Select the most matching category number from below:

{self.categories_list}

Answer in pure JSON format (no other text), all content in English:
{{"title": "English image description", "keywords": ["keyword1", "keyword2", ...], "category": "number"}}"""

            # 构建请求
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            payload = {
                "model": "qwen-vl-max",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            }

            # 发送请求（缩短超时时间）
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()

            # 解析响应
            if result.get("choices"):
                content = result["choices"][0]["message"]["content"]

                # 提取JSON
                if "{" in content:
                    start = content.find("{")
                    end = content.rfind("}") + 1
                    json_str = content[start:end]

                    try:
                        data = json.loads(json_str)

                        # 处理关键词 - 最多49个关键词
                        keywords_list = data.get("keywords", [])
                        if isinstance(keywords_list, list):
                            # 限制关键词数量最多49个
                            keywords_list = keywords_list[:49]
                            keywords_str = ", ".join(keywords_list)
                        else:
                            keywords_str = str(keywords_list)

                        category_num = str(data.get("category", ""))

                        # 更新进度
                        with self.progress_lock:
                            self.progress_counter += 1
                            print(f"[{self.progress_counter}/{total}] {filename} [OK]")

                        return {
                            "Filename": filename,
                            "Title": str(data.get("title", ""))[:200],
                            "Keywords": keywords_str,
                            "Category": category_num,
                            "Publish": ""
                        }
                    except json.JSONDecodeError:
                        print(f"[{index}/{total}] {filename} JSON解析失败")

        except Exception as e:
            print(f"[{index}/{total}] {filename} [FAIL]: {str(e)[:50]}")

        return {
            "Filename": filename,
            "Title": "",
            "Keywords": "",
            "Category": "",
            "Publish": ""
        }

    def get_images(self, folder_path: str) -> List[str]:
        """获取文件夹中所有支持的图片"""
        folder = Path(folder_path)
        if not folder.exists():
            raise ValueError(f"文件夹不存在: {folder_path}")

        images = []
        for file in folder.iterdir():
            if file.is_file() and file.suffix.lower() in self.supported_formats:
                images.append(str(file))

        return sorted(images)

    def process_folder(self) -> List[Dict]:
        """并发处理文件夹中的所有图片"""
        input_folder = self.config["input_folder"]
        images = self.get_images(input_folder)

        if not images:
            print(f"在 {input_folder} 中没有找到支持的图片文件")
            return []

        total = len(images)
        print(f"找到 {total} 张图片，使用 {self.max_workers} 个线程并发处理...")
        print("=" * 50)

        results = []

        # 使用线程池并发处理
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # 提交所有任务
            futures = {
                executor.submit(self._analyze_image, img, i, total): img
                for i, img in enumerate(images, 1)
            }

            # 收集结果（按完成顺序）
            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    img_path = futures[future]
                    print(f"处理 {Path(img_path).name} 时出错: {e}")
                    results.append({
                        "Filename": Path(img_path).name,
                        "Title": "",
                        "Keywords": "",
                        "Category": "",
                        "Publish": ""
                    })

        # 按原始顺序排序结果
        results.sort(key=lambda x: images.index(
            next(img for img in images if Path(img).name == x["Filename"])
        ))

        return results

    def save_to_csv(self, results: List[Dict], output_path: Optional[str] = None):
        """保存结果到CSV文件"""
        if output_path is None:
            output_path = os.path.join(
                self.config["output_folder"],
                "Sample_Adobe_Stock_CSV_upload.csv"
            )

        # 确保输出文件夹存在
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        # 写入CSV
        with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "Filename", "Title", "Keywords", "Category", "Publish"
            ])
            writer.writeheader()
            writer.writerows(results)

        print(f"\n结果已保存到: {output_path}")

    def run(self):
        """运行主程序"""
        print("=" * 50)
        print("图片识别程序 - 阿里云通义千问VL (并发版)")
        print("=" * 50)

        try:
            results = self.process_folder()
            if results:
                self.save_to_csv(results)

                success_count = sum(1 for r in results if r["Title"])
                print(f"\n[完成] 成功 {success_count}/{len(results)} 张")

            else:
                print("\n没有图片需要处理")
        except Exception as e:
            print(f"\n错误: {e}")
            raise


class TrendAnalyzer:
    """Adobe Stock 趋势分析与提示词生成器"""

    BUILTIN_TRENDS = [
        "Surreal Silliness - Playful, absurd, and whimsical imagery combining unexpected elements",
        "Connectioneering - Visual storytelling about human connection and technology",
        "All the Feels - Emotional, authentic, and deeply human moments",
        "AI Generated Aesthetics - Futuristic, synthetic, and algorithmically-inspired visuals",
        "Sustainable Living - Eco-friendly, green technology, environmental consciousness",
        "Retro Futurism - Nostalgic vision of the future from past decades",
        "Minimalist Maximalism - Bold simplicity with maximum impact",
        "Authentic Diversity - Real people, real stories, inclusive representation",
    ]

    POPULAR_KEYWORDS = [
        "business", "technology", "nature", "people", "lifestyle",
        "food", "travel", "abstract", "background", "medical",
        "education", "fitness", "summer", "winter", "spring",
        "corporate", "family", "celebration", "holiday", "wellness",
    ]

    def __init__(self, api_key: str, api_url: str):
        self.api_key = api_key
        self.api_url = api_url
        self.text_model = "qwen-max"

    def fetch_trends(self) -> List[str]:
        """获取当前趋势（三层降级）"""
        print("[信息] 正在获取 Adobe Stock 趋势数据...")

        trends = self._fetch_from_adobe_stock()
        if trends:
            return trends

        print("[信息] 使用内置趋势数据")
        return self._get_builtin_trends()

    def _fetch_from_adobe_stock(self) -> List[str]:
        """从 Adobe Stock 网站获取趋势数据"""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }

        # 第1层：趋势页面
        try:
            resp = requests.get(
                "https://stock.adobe.com/trends",
                headers=headers, timeout=10
            )
            if resp.status_code == 200:
                trends = self._parse_trends_page(resp.text)
                if trends:
                    print(f"[信息] 从趋势页面获取 {len(trends)} 条数据")
                    return trends
        except Exception:
            pass

        # 第2层：热门搜索页面
        try:
            resp = requests.get(
                "https://stock.adobe.com/popular",
                headers=headers, timeout=10
            )
            if resp.status_code == 200:
                trends = self._parse_popular_page(resp.text)
                if trends:
                    print(f"[信息] 从热门页面获取 {len(trends)} 条数据")
                    return trends
        except Exception:
            pass

        return []

    def _parse_trends_page(self, html: str) -> List[str]:
        """解析趋势页面"""
        trends = []

        for pattern in [
            r'"trendName"\s*:\s*"([^"]+)"',
            r'<h[23][^>]*class="[^"]*trend[^"]*"[^>]*>([^<]+)</h[23]>',
            r'"title"\s*:\s*"((?:trend|popular)[^"]*)"',
        ]:
            trends.extend(re.findall(pattern, html, re.IGNORECASE))

        trends = [t.strip() for t in trends if t.strip()]
        return list(dict.fromkeys(trends))[:8]

    def _parse_popular_page(self, html: str) -> List[str]:
        """解析热门页面"""
        for pattern in [
            r'data-keyword="([^"]+)"',
            r'"search_term"\s*:\s*"([^"]+)"',
        ]:
            keywords = re.findall(pattern, html)
            if keywords:
                return list(dict.fromkeys(keywords))[:10]
        return []

    def _get_builtin_trends(self) -> List[str]:
        """返回内置趋势数据"""
        return self.BUILTIN_TRENDS + self.POPULAR_KEYWORDS

    def generate_prompts(self, count: int) -> List[str]:
        """生成 n 个提示词"""
        trends = self.fetch_trends()
        trends_text = "\n".join(f"- {t}" for t in trends)

        prompt = f"""You are a creative director specializing in stock photography.

Current Adobe Stock Trends:
{trends_text}

Generate exactly {count} unique, creative image prompt ideas that would sell well on Adobe Stock.

Rules:
- Each prompt on a single line, English only
- Include specific visual elements, moods, lighting, and composition
- Make prompts suitable for AI image generation (Midjourney, DALL-E style)
- Vary subjects across categories: people, nature, technology, business, lifestyle, abstract, food, travel
- Consider diversity, authenticity, and emotional connection
- No numbering, no extra text, just the prompts

Example:
Golden hour silhouette of diverse friends laughing on rooftop, warm atmospheric lighting, candid lifestyle photography"""

        print(f"[信息] 正在生成 {count} 个提示词...")
        response = self._call_text_model(prompt)

        if not response:
            return []

        prompts = []
        for line in response.strip().split("\n"):
            line = line.strip()
            line = re.sub(r'^\d+[\.\)]\s*', '', line)
            if line:
                prompts.append(line)

        return prompts[:count]

    def _call_text_model(self, prompt: str) -> str:
        """调用阿里云 qwen-max 文本模型"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.text_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.8,
            "max_tokens": 3000,
        }

        response = requests.post(
            self.api_url, headers=headers, json=payload, timeout=60
        )
        response.raise_for_status()
        result = response.json()

        if result.get("choices"):
            return result["choices"][0]["message"]["content"]
        return ""


def main():
    """主函数"""
    import argparse
    parser = argparse.ArgumentParser(
        description='阿里云图片识别程序 + 趋势提示词生成器',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  图片识别模式:
    py alibaba_image_recognizer.py -w 5

  生成趋势提示词:
    py alibaba_image_recognizer.py -g 20
    py alibaba_image_recognizer.py --generate-prompts 50
        """
    )
    parser.add_argument('-c', '--config', default='config.json', help='配置文件路径')
    parser.add_argument('-w', '--workers', type=int, help='并发线程数（默认3）')
    parser.add_argument('-g', '--generate-prompts', type=int, metavar='N',
                        help='生成 N 个趋势提示词（不执行图片识别）')
    args = parser.parse_args()

    config_path = args.config

    if not os.path.exists(config_path):
        print(f"错误: 配置文件 {config_path} 不存在")
        return

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        api_key = config.get("alibaba_api_key", "")
        if not api_key:
            print("错误: 配置文件中缺少 alibaba_api_key")
            return

        if args.generate_prompts:
            # 趋势提示词生成模式
            api_url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            analyzer = TrendAnalyzer(api_key, api_url)
            prompts = analyzer.generate_prompts(args.generate_prompts)

            if prompts:
                print()
                for p in prompts:
                    print(p)
            else:
                print("\n生成失败，请检查网络和 API 配置")
        else:
            # 图片识别模式
            recognizer = AlibabaImageRecognizer(config_path)
            if args.workers:
                recognizer.max_workers = args.workers
            recognizer.run()

    except ValueError as e:
        print(f"配置错误: {e}")
    except Exception as e:
        print(f"运行错误: {e}")
        raise


if __name__ == "__main__":
    main()