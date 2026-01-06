<?php
namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;

#[\Attribute(\Attribute::TARGET_CLASS)]
class HousekeepersAllocation extends Constraint
{
    public string $message = 'Invalid Housekeepers allocation: {{ reason }}';

    public function getTargets(): string
    {
        return self::CLASS_CONSTRAINT;
    }
}