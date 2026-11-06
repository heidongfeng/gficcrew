<?php

// 后台 AI 功能的同源代理。
//
// 原来这些请求走 WorkBuddy 云端大模型，迁到自有服务器后改为转发到任意
// OpenAI 兼容的 /chat/completions 端点。模型 Key 只存在网站根目录之外的
// config.php 里，绝不下发到浏览器；未配置时明确返回 503，而不是假装成功。

require_once __DIR__ . '/_lib.php';

gfic_require_method('POST');

try {
    gfic_require_auth();
    $config = gfic_load_config();
} catch (Throwable $error) {
    gfic_error(500, '服务未初始化');
}

$llm = isset($config['llm']) && is_array($config['llm']) ? $config['llm'] : array();
$baseUrl = isset($llm['baseUrl']) ? trim($llm['baseUrl']) : '';
$apiKey = isset($llm['apiKey']) ? trim($llm['apiKey']) : '';
$model = isset($llm['model']) ? trim($llm['model']) : '';

if ($baseUrl === '' || $apiKey === '' || $model === '') {
    gfic_error(503, 'AI 功能尚未配置模型 Key。内容编辑、保存和发布不受影响；需要使用 AI 时，在服务器 /www/gfic-data/config.php 里补 llm 配置（baseUrl / apiKey / model）。');
}

if (preg_match('#^https://#i', $baseUrl) !== 1) {
    gfic_error(500, 'AI 接口地址必须使用 https');
}

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody === false ? '' : $rawBody, true);
if (!is_array($body) || !isset($body['messages']) || !is_array($body['messages'])) {
    gfic_error(400, '请求体必须包含 messages');
}

$stream = !empty($body['stream']);
$payload = array(
    'model' => $model,
    'messages' => $body['messages'],
    'stream' => $stream,
);
if (isset($body['temperature']) && is_numeric($body['temperature'])) {
    $payload['temperature'] = (float) $body['temperature'];
}

$endpoint = rtrim($baseUrl, '/') . '/chat/completions';
$ch = curl_init($endpoint);
if ($ch === false) {
    gfic_error(500, '无法初始化 AI 请求');
}

$headers = array(
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey,
    'Accept: ' . ($stream ? 'text/event-stream' : 'application/json'),
);

$upstreamStatus = 0;
$upstreamError = '';

curl_setopt_array($ch, array(
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => !$stream,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => $stream ? 180 : 120,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
));

if ($stream) {
    header('Content-Type: text/event-stream; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header('X-Accel-Buffering: no');
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($curl, $chunk) {
        echo $chunk;
        flush();
        return strlen($chunk);
    });
} else {
    gfic_json_headers();
}

$result = curl_exec($ch);
$upstreamStatus = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$upstreamError = curl_error($ch);
curl_close($ch);

if ($result === false) {
    if (!$stream) {
        gfic_error(502, 'AI 接口连接失败：' . $upstreamError);
    }
    // 流式响应头已发出，只能以 SSE 形式告知失败。
    echo 'data: ' . json_encode(array('error' => array('message' => 'AI 接口连接失败')), JSON_UNESCAPED_UNICODE) . "\n\n";
    echo "data: [DONE]\n\n";
    flush();
    exit;
}

if ($upstreamStatus < 200 || $upstreamStatus >= 300) {
    if ($stream) {
        // 同上，头部已发，错误以 SSE 形式返回给前端解析器。
        echo 'data: ' . $result . "\n\n";
        echo "data: [DONE]\n\n";
        flush();
        exit;
    }
    http_response_code(502);
    echo $result;
    exit;
}

if (!$stream) {
    http_response_code(200);
    echo $result;
}
exit;
