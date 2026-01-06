<?php

namespace App\Service\Document;

class AttachOptions
{
    public function __construct(
        public string $targetType,
        public int $targetId,
        public ?string $category = null,
        public string $mode = 'allow-many',     // 'replace' | 'allow-many'
        public string $scope = 'per-category',  // 'per-category' | 'per-parent' (used if mode = replace)
    ) {}
}