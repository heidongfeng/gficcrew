<?php

require_once __DIR__ . '/_lib.php';

gfic_require_method('GET');

try {
    $config = gfic_load_config();
    $token = isset($_GET['token']) && is_string($_GET['token']) ? $_GET['token'] : '';
    if ($token === '' || !hash_equals($config['exportToken'], $token)) {
        gfic_error(403, '导出令牌错误');
    }
    $raw = gfic_read_file(gfic_path('data.json'));
    if ($raw === null) {
        gfic_error(500, '数据文件不存在');
    }
    http_response_code(200);
    gfic_json_headers();
    echo $raw;
    exit;
} catch (Throwable $error) {
    gfic_error(500, '服务器内部错误');
}
