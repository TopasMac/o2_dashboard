<?php
namespace App\Validator\Constraints;

use App\Entity\HKTransactions;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

class HousekeepersAllocationValidator extends ConstraintValidator
{
    /**
     * @param HKTransactions $transaction
     */
    public function validate($transaction, Constraint $constraint): void
    {
        if (!$transaction instanceof HKTransactions) {
            return;
        }

        // Ensure we are validating with the correct constraint type
        // (prevents confusing errors if misapplied)
        // if (!$constraint instanceof HousekeepersAllocation) {
        //     return;
        // }

        $target = $transaction->getAllocationTarget();
        $unit   = $transaction->getUnit();
        $city   = $transaction->getCity();

        // 1) If allocating to Housekeepers_* (Playa/Tulum/General), there must be NO specific unit
        if (in_array($target, [
            HKTransactions::ALLOC_HK_PLAYA,
            HKTransactions::ALLOC_HK_TULUM,
            HKTransactions::ALLOC_HK_GENERAL,
            HKTransactions::ALLOC_HK_BOTH, // legacy
        ], true)) {
            if ($unit !== null) {
                $this->context->buildViolation($constraint->message)
                    ->setParameter('{{ reason }}', 'Housekeepers allocation cannot have a specific unit linked')
                    ->atPath('unit')
                    ->addViolation();
            }
            // City is required for Housekeepers allocations
            if ($city === null || $city === '') {
                $this->context->buildViolation($constraint->message)
                    ->setParameter('{{ reason }}', 'City is required when allocating to Housekeepers')
                    ->atPath('city')
                    ->addViolation();
            }
        }

        // 2) If allocating to Unit, a Unit must be provided and (if city provided) it must match the unit city
        if ($target === HKTransactions::ALLOC_UNIT) {
            if ($unit === null) {
                $this->context->buildViolation($constraint->message)
                    ->setParameter('{{ reason }}', 'Unit allocation requires a unit')
                    ->atPath('unit')
                    ->addViolation();
                // If no unit, we cannot compare cities; stop here
                return;
            }
            $unitCity = $unit->getCity();
            if ($city !== null && $city !== '' && $city !== $unitCity) {
                $this->context->buildViolation($constraint->message)
                    ->setParameter('{{ reason }}', 'City must match the unit city when allocating to Unit')
                    ->atPath('city')
                    ->addViolation();
            }
        }
    }
}