<?php

namespace App\Service;

use App\Entity\Employee;
use App\Entity\Unit;
use App\Entity\TransactionCategory;
use App\Repository\EmployeeRepository;
use App\Repository\UnitRepository;
use App\Repository\TransactionCategoryRepository;

/**
 * Provides lookup data / form options for the Employee Cash / Expense flows.
 *
 * This service is intentionally separate from EmployeeLedgerService so that
 * business rules (create/update/list) stay decoupled from “what options the
 * frontend needs to render a form”.
 */
class EmployeeTransactionsFormService
{
    private EmployeeRepository $employeeRepository;
    private UnitRepository $unitRepository;
    private TransactionCategoryRepository $transactionCategoryRepository;

    public function __construct(
        EmployeeRepository $employeeRepository,
        UnitRepository $unitRepository,
        TransactionCategoryRepository $transactionCategoryRepository
    ) {
        $this->employeeRepository = $employeeRepository;
        $this->unitRepository = $unitRepository;
        $this->transactionCategoryRepository = $transactionCategoryRepository;
    }

    /**
     * Backward‑compatible alias expected by the controller.
     * The controller calls $this->formService->getFormOptions()
     * but the actual implementation method is getAdminOptions().
     */
    public function getFormOptions(): array
    {
        return $this->getAdminOptions();
    }

    /**
     * Main entry point for the admin Employee Transactions page.
     *
     * Returns a structured payload that the frontend can use to build
     * dropdowns / autocompletes without hitting multiple endpoints.
     *
     * Shape (example):
     *  [
     *      'employees'  => [ { id, name, shortName }, ... ],
     *      'units'      => [ { id, unitName, city }, ... ],
     *      'categories' => [
     *          'unit'         => [ { id, name, type }, ... ],
     *          'owners2'      => [ { id, name, type }, ... ],
     *          'housekeepers' => [ { id, name, type }, ... ],
     *      ],
     *      'cities'     => [
     *          'general' => 'General',
     *          'playa'   => 'Playa del Carmen',
     *          'tulum'   => 'Tulum',
     *      ],
     *  ]
     */
    public function getAdminOptions(): array
    {
        return [
            'employees' => $this->getEmployees(),
            'units' => $this->getUnits(),
            'categories' => [
                'unit'         => $this->getUnitCategories(),
                'owners2'      => $this->getOwners2Categories(),
                'housekeepers' => $this->getHousekeeperCategories(),
            ],
            'cities' => [
                'general' => 'General',
                'playa'   => 'Playa del Carmen',
                'tulum'   => 'Tulum',
            ],
            'types' => $this->getTypes(),
        ];
    }

    /**
     * List of employees for autocomplete.
     *
     * We default to shortName when available, falling back to full name.
     *
     * @return array<int, array{id:int, name:string, shortName:?string}>
     */
    public function getEmployees(): array
    {
        /** @var Employee[] $employees */
        $employees = $this->employeeRepository->findBy([], ['shortName' => 'ASC', 'name' => 'ASC']);

        $out = [];
        foreach ($employees as $employee) {
            $shortName = method_exists($employee, 'getShortName') ? $employee->getShortName() : null;
            $name = $shortName ?: (method_exists($employee, 'getName') ? $employee->getName() : null);

            if ($name === null) {
                $name = 'Employee #' . $employee->getId();
            }

            $out[] = [
                'id'        => $employee->getId(),
                'name'      => $name,
                'shortName' => $shortName,
                'division'  => method_exists($employee, 'getDivision') ? $employee->getDivision() : null,
                'city'      => method_exists($employee, 'getCity') ? $employee->getCity() : null,
            ];
        }

        return $out;
    }

    /**
     * Units that can be used as cost centre = Unit.
     *
     * @return array<int, array{id:int, unitName:string, city:?string}>
     */
    public function getUnits(): array
    {
        /** @var Unit[] $units */
        $units = $this->unitRepository->findBy([], ['unitName' => 'ASC']);

        $out = [];
        foreach ($units as $unit) {
            $unitName = method_exists($unit, 'getUnitName') ? $unit->getUnitName() : null;
            if ($unitName === null && method_exists($unit, 'getListingName')) {
                $unitName = $unit->getListingName();
            }
            if ($unitName === null) {
                $unitName = 'Unit #' . $unit->getId();
            }

            $city = null;
            if (method_exists($unit, 'getCity')) {
                $city = $unit->getCity();
            } elseif (method_exists($unit, 'getCityName')) {
                $city = $unit->getCityName();
            }

            $out[] = [
                'id' => $unit->getId(),
                'unitName' => $unitName,
                'city' => $city,
            ];
        }

        return $out;
    }

    /**
     * Categories allowed for Unit expenses (allowUnit = 1).
     *
     * @return array<int, array{id:int, name:string, type:?string}>
     */
    public function getUnitCategories(): array
    {
        return $this->buildCategoryList(['allowUnit' => true]);
    }

    /**
     * Categories allowed for Owners2 expenses (allowO2 = 1).
     *
     * @return array<int, array{id:int, name:string, type:?string}>
     */
    public function getOwners2Categories(): array
    {
        return $this->buildCategoryList(['allowO2' => true]);
    }

    /**
     * Categories allowed for Housekeepers expenses (allowHk = 1).
     *
     * @return array<int, array{id:int, name:string, type:?string}>
     */
    public function getHousekeeperCategories(): array
    {
        return $this->buildCategoryList(['allowHk' => true]);
    }

    /**
     * Internal helper to build category option arrays.
     *
     * @param array<string,mixed> $criteria
     *
     * @return array<int, array{id:int, name:string, type:?string}>
     */
    private function buildCategoryList(array $criteria): array
    {
        /** @var TransactionCategory[] $categories */
        $categories = $this->transactionCategoryRepository->findBy(
            $criteria,
            ['name' => 'ASC']
        );

        $out = [];
        foreach ($categories as $category) {
            $name = method_exists($category, 'getName') ? $category->getName() : ('Category #' . $category->getId());
            $type = method_exists($category, 'getType') ? $category->getType() : null;

            $out[] = [
                'id' => $category->getId(),
                'name' => $name,
                'type' => $type,
            ];
        }

        return $out;
    }
    /**
     * Transaction types used by the Employee Cash / Expense form.
     *
     * @return array<int, array{value:string, label:string}>
     */
    public function getTypes(): array
    {
        return [
            ['value' => 'CashAdvance',  'label' => 'Cash Advance'],
            ['value' => 'GuestPayment', 'label' => 'Guest Payment'],
            ['value' => 'CashReturn',   'label' => 'Cash Return'],
            ['value' => 'Expense',      'label' => 'Expense'],
        ];
    }
}
