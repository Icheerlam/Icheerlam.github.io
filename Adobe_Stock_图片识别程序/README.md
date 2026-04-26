# 图片识别程序 - 阿里云通义千问VL

## 快速开始

### 1. 配置API密钥

编辑 `config.json`，填入你的阿里云API密钥：
```json
{
  "alibaba_api_key": "sk-你的API密钥"
}
```

### 2. 运行程序

双击 `运行.bat` 或命令行执行：
```bash
py alibaba_image_recognizer.py
```

### 3. 查看结果

结果保存在 `识别结果` 文件夹，CSV格式可用Excel打开。

## 文件说明

| 文件 | 说明 |
|------|------|
| `alibaba_image_recognizer.py` | 主程序 |
| `config.json` | 配置文件 |
| `运行.bat` | 一键运行 |
| `example.csv` | 输出格式示例 |
| `阿里云使用指南.md` | 详细说明 |

## 输出格式

CSV文件包含：
- Filename：完整文件名（含扩展名）
- Title：英文描述（最多200字符）
- Keywords：英文关键词，逗号分隔（最多49个关键词）
- Category：数字代码（1-21）
- Publish：空白（需手动填写）

## 获取阿里云API密钥

1. 访问 https://dashscope.aliyuncs.com/
2. 注册/登录账号（需实名认证）
3. 开通"通义千问VL"服务
4. 创建API密钥（格式：`sk-xxxxxxxxxxxxx`）

详细步骤请查看 [阿里云使用指南.md](阿里云使用指南.md)

## 注意事项

- 新用户有免费额度
- 图片过大会自动压缩
- 建议先用少量图片测试

---