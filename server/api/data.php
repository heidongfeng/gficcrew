<?php

require_once __DIR__ . '/_lib.php';

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    gfic_error(405, '请求方法不允许');
}

try {
    gfic_require_auth();

    if ($method === 'GET') {
        $raw = gfic_read_file(gfic_path('data.json'));
        if ($raw === null) {
            gfic_error(500, '数据文件不存在');
        }
        $data = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
            gfic_error(500, '数据文件格式错误');
        }
        gfic_json(array('ok' => true, 'data' => $data));
    }

    $rawBody = null;
    $body = gfic_read_json_body(5 * 1024 * 1024, $rawBody);
    if (!isset($body['data']) || !is_array($body['data'])) {
        gfic_error(400, '请求必须包含 data 对象');
    }
    $objectBody = json_decode($rawBody);
    $data = $body['data'];
    $validationError = gfic_validate_data(isset($objectBody->data) ? $objectBody->data : null);
    if ($validationError !== null) {
        gfic_error(400, $validationError);
    }

    $saved = 0;
    foreach (gfic_collections() as $collection) {
        $saved += count($data[$collection]);
    }
    $encoded = gfic_encode_json($data);
    gfic_atomic_write(gfic_path('data.json'), $encoded, 'gfic_backup_data');
    gfic_json(array('ok' => true, 'saved' => $saved));
} catch (Throwable $error) {
    gfic_error(500, '服务器内部错误');
}
