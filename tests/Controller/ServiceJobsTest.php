<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Kernel;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use PHPUnit\Framework\Attributes\IgnoreDeprecations;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

final class ServiceJobsTest extends KernelTestCase
{
    private const JOBS = '/api/service-jobs';

    protected static function getKernelClass(): string
    {
        return Kernel::class;
    }

    #[IgnoreDeprecations]
    public function testAdminSchedulingAndAccess(): void
    {
        if (getenv('RUN_SERVICE_JOB_DB_TEST') !== '1') {
            self::markTestSkipped('Requires a migrated local owners2_dev_servicejobs_test schema with unit, category and provider fixtures.');
        }

        self::bootKernel();
        $container = self::getContainer();
        $em = $container->get(EntityManagerInterface::class);
        $connection = $em->getConnection();
        self::assertSame('owners2_dev_servicejobs_test', $connection->getParams()['dbname'] ?? null);
        self::assertContains($connection->getParams()['host'] ?? null, ['localhost', '127.0.0.1']);

        $connection->beginTransaction();
        try {
            $tokens = $container->get(JWTTokenManagerInterface::class);
            $admin = $tokens->create($this->createUser($em, 'ROLE_ADMIN'));
            $manager = $tokens->create($this->createUser($em, 'ROLE_MANAGER'));
            $before = $connection->fetchOne('SELECT COUNT(*) FROM hktransactions');

            $connection->update('unit', ['status' => 'Active'], ['unit_name' => 'IT_001']);
            $connection->insert('unit', ['unit_name' => 'SERVICE_JOB_INACTIVE', 'status' => 'Inactive']);
            $inactiveId = (int) $connection->lastInsertId();

            $options = $this->json('GET', self::JOBS.'/options', $admin, 200);
            $units = array_column($options['units'], 'id', 'name');
            $categories = array_column($options['categories'], 'id', 'name');
            self::assertArrayHasKey('IT_001', $units);
            self::assertArrayNotHasKey('SERVICE_JOB_INACTIVE', $units);
            self::assertArrayHasKey('Mantenimiento', $categories);
            self::assertSame([], array_diff(array_keys($categories), ['Mantenimiento', 'Equipamiento', 'Servicios Externos']));

            $directory = $this->json('GET', '/api/service-providers', $admin, 200);
            self::assertNotEmpty($directory['providers']);
            $providerId = $directory['providers'][0]['id'];

            $payload = [
                'unitId' => $units['IT_001'],
                'categoryId' => $categories['Mantenimiento'],
                'scheduledDate' => '2026-11-12',
                'description' => 'Clean pipes',
            ];
            $invalidUnit = $this->request('POST', self::JOBS, $admin, array_replace($payload, ['unitId' => $inactiveId]));
            self::assertSame(400, $invalidUnit->getStatusCode());

            $created = $this->json('POST', self::JOBS, $admin, 201, $payload)['job'];
            self::assertSame('pending', $created['status']);
            self::assertSame('CLIENT', $created['bill_to']);
            self::assertNull($created['provider']);
            $path = self::JOBS.'/'.$created['id'];

            foreach ([
                ['GET', self::JOBS, []],
                ['GET', self::JOBS.'/options', []],
                ['POST', self::JOBS, $payload],
                ['PATCH', $path, ['status' => 'done']],
            ] as [$method, $url, $data]) {
                self::assertSame(401, $this->request($method, $url, null, $data)->getStatusCode());
                $denied = $this->request($method, $url, $manager, $data);
                self::assertSame(403, $denied->getStatusCode(), $denied->getContent());
            }

            $assigned = $this->json('PATCH', $path, $admin, 200, ['providerId' => $providerId])['job'];
            self::assertSame($providerId, $assigned['provider']['id']);
            $this->json('PATCH', $path, $admin, 200, ['status' => 'done', 'notes' => 'Completed']);
            $this->json('PATCH', $path, $admin, 200, ['bill_to' => 'OWNERS2']);
            $second = $this->json('POST', self::JOBS, $admin, 201, $payload + ['bill_to' => 'OWNERS2'])['job'];
            self::assertSame('OWNERS2', $second['bill_to']);
            $this->json('PATCH', self::JOBS.'/'.$second['id'], $admin, 200, ['bill_to' => 'CLIENT']);
            $this->json('PATCH', self::JOBS.'/'.$second['id'], $admin, 200, ['status' => 'cancelled']);

            $uncurated = $connection->fetchOne("SELECT id FROM transaction_category WHERE name NOT IN ('Mantenimiento', 'Equipamiento', 'Servicios Externos') LIMIT 1");
            self::assertNotFalse($uncurated);
            foreach ([
                ['scheduledDate' => '2026-02-30'],
                ['categoryId' => (int) $uncurated],
                ['status' => 'invalid'],
                ['bill_to' => null],
                ['bill_to' => 'GUEST'],
                ['description' => '   '],
            ] as $invalid) {
                $response = $this->request('PATCH', $path, $admin, $invalid);
                self::assertSame(400, $response->getStatusCode(), $response->getContent());
            }

            $em->clear();
            $jobs = array_column($this->json('GET', self::JOBS, $admin, 200)['jobs'], null, 'id');
            $done = $jobs[$created['id']];
            self::assertSame('IT_001', $done['unit']['name']);
            self::assertSame('Mantenimiento', $done['category']['name']);
            self::assertSame('2026-11-12', $done['scheduledDate']);
            self::assertSame('Clean pipes', $done['description']);
            self::assertSame('Completed', $done['notes']);
            self::assertSame($providerId, $done['provider']['id']);
            self::assertSame('done', $done['status']);
            self::assertSame('OWNERS2', $done['bill_to']);
            self::assertSame('CLIENT', $jobs[$second['id']]['bill_to']);
            self::assertSame('cancelled', $jobs[$second['id']]['status']);
            self::assertSame($before, $connection->fetchOne('SELECT COUNT(*) FROM hktransactions'));

            $allocationPath = $path.'/allocations';
            $equipmentCategory = $categories['Equipamiento'];
            $line = [
                'requestKey' => '00000000-0000-4000-8000-000000000001',
                'date' => '2026-10-31',
                'categoryId' => $categories['Mantenimiento'],
                'allocationTarget' => 'Client',
                'description' => 'Service Job Labour',
                'paid' => '100.00',
                'charged' => '120.00',
            ];
            self::assertSame(403, $this->request('PUT', $allocationPath, $manager, $line)->getStatusCode());
            self::assertSame(409, $this->request('PUT', self::JOBS.'/'.$second['id'].'/allocations', $admin, $line)->getStatusCode());
            $pending = $this->json('POST', self::JOBS, $admin, 201, $payload)['job'];
            self::assertSame(409, $this->request('PUT', self::JOBS.'/'.$pending['id'].'/allocations', $admin, $line)->getStatusCode());
            self::assertSame($before, $connection->fetchOne('SELECT COUNT(*) FROM hktransactions'));
            $labour = $this->json('PUT', $allocationPath, $admin, 200, $line)['allocation'];
            self::assertSame('labour', $labour['lineType']);
            $retry = $this->json('PUT', $allocationPath, $admin, 200, $line)['allocation'];
            self::assertSame($labour['id'], $retry['id']);
            self::assertSame($labour['transactionCode'], $retry['transactionCode']);
            self::assertSame(1, (int) $connection->fetchOne('SELECT COUNT(*) FROM hktransactions WHERE service_job_id = ?', [$created['id']]));

            $equipmentLine = array_replace($line, [
                'requestKey' => '00000000-0000-4000-8000-000000000002',
                'date' => '2026-11-01',
                'categoryId' => $equipmentCategory,
                'description' => 'Service Job Equipment',
                'charged' => '150.00',
            ]);
            $equipment = $this->json('PUT', $allocationPath, $admin, 200, $equipmentLine)['allocation'];
            self::assertSame('equipment', $equipment['lineType']);
            self::assertNotSame($labour['id'], $equipment['id']);
            $secondEquipmentLine = array_replace($equipmentLine, [
                'requestKey' => '00000000-0000-4000-8000-000000000003',
                'allocationTarget' => 'Owners2',
            ]);
            $secondEquipment = $this->json('PUT', $allocationPath, $admin, 200, $secondEquipmentLine)['allocation'];
            self::assertSame('equipment', $secondEquipment['lineType']);
            self::assertNotSame($equipment['id'], $secondEquipment['id']);
            self::assertSame($secondEquipment['id'], $this->json('PUT', $allocationPath, $admin, 200, $secondEquipmentLine)['allocation']['id']);
            $em->clear();

            $jobs = array_column($this->json('GET', self::JOBS, $admin, 200)['jobs'], null, 'id');
            self::assertEqualsCanonicalizing([$labour['id'], $equipment['id'], $secondEquipment['id']],
                array_column($jobs[$created['id']]['allocations'], 'id'));

            self::assertEqualsCanonicalizing(
                [$labour['transactionCode'], $equipment['transactionCode'], $secondEquipment['transactionCode']],
                array_column($jobs[$created['id']]['allocations'], 'transactionCode')
            );

            $report = $container->get(\App\Service\Reports\UnitMonthlyReportService::class);
            $allocationRows = static function (string $month) use ($report, $units, $labour, $equipment, $secondEquipment): array {
                $rows = $report->build($units['IT_001'], $month)['housekeeping']['rows'];

                return array_values(array_filter($rows, static fn (array $row): bool =>
                    $row['sourceType'] === 'HK_TRANSACTION' && in_array((int) $row['id'], [$labour['id'], $equipment['id'], $secondEquipment['id']], true)
                ));
            };
            self::assertSame([$labour['id']], array_map('intval', array_column($allocationRows('2026-10'), 'id')));
            self::assertSame([$equipment['id']], array_map('intval', array_column($allocationRows('2026-11'), 'id')));

            $sameMonth = array_replace($equipmentLine, ['date' => '2026-10-31', 'allocationId' => $equipment['id']]);
            $this->json('PUT', $allocationPath, $admin, 200, $sameMonth);
            self::assertEqualsCanonicalizing([$labour['id'], $equipment['id']], array_map('intval', array_column($allocationRows('2026-10'), 'id')));
            $octoberCharges = array_column($allocationRows('2026-10'), 'charged', 'id');
            self::assertSame(120.0, $octoberCharges[$labour['id']]);
            self::assertSame(150.0, $octoberCharges[$equipment['id']]);
            self::assertSame([], $allocationRows('2026-11'));

            $edited = $this->json('PUT', $allocationPath, $admin, 200, array_replace($equipmentLine, [
                'allocationTarget' => 'Owners2',
                'allocationId' => $equipment['id'],
                'charged' => '160.00',
            ]))['allocation'];
            self::assertSame($equipment['id'], $edited['id']);
            self::assertSame($equipment['transactionCode'], $edited['transactionCode']);
            self::assertSame('160.00', $edited['charged']);
            self::assertSame([], $allocationRows('2026-11'));
            self::assertSame([$labour['id']], array_map('intval', array_column($allocationRows('2026-10'), 'id')));
            self::assertSame(3, (int) $connection->fetchOne('SELECT COUNT(*) FROM hktransactions WHERE service_job_id = ?', [$created['id']]));
            self::assertSame(403, $this->request('DELETE', '/api/hk-transactions/'.$equipment['id'], $manager, [])->getStatusCode());

            $unit = $em->find(\App\Entity\Unit::class, $units['IT_001']);
            $cleaning = (new \App\Entity\HKCleanings())
                ->setUnit($unit)
                ->setCity('Playa del Carmen')
                ->setCheckoutDate(new \DateTime('2026-11-03'))
                ->setCleaningType('checkout')
                ->setBillTo('CLIENT')
                ->setO2CollectedFee('300.00');
            $em->persist($cleaning);
            $em->flush();
            $container->get(\App\Service\HKCleaningManager::class)->completeCleaning($cleaning);
            $november = $report->build($unit->getId(), '2026-11')['housekeeping']['rows'];
            self::assertCount(1, array_filter($november, static fn (array $row): bool =>
                $row['sourceType'] === 'HK_CLEANING' && (int) $row['id'] === $cleaning->getId()
            ));

            $employee = (new \App\Entity\Employee())
                ->setEmployeeCode('SJ'.bin2hex(random_bytes(4)))
                ->setName('Synthetic cash employee')
                ->setDivision('Housekeepers')
                ->setArea('Housekeepers')
                ->setCity('Playa del Carmen')
                ->setDateStarted(new \DateTime('2026-01-01'))
                ->setInitialSalary('0.00')
                ->setCurrentSalary('0.00');
            $cash = (new \App\Entity\EmployeeCashLedger())
                ->setCode('SJ'.bin2hex(random_bytes(4)))
                ->setEmployee($employee)
                ->setType('Expense')
                ->setAmount('100.00')
                ->setStatus('Approved');
            $em->persist($employee);
            $em->persist($cash);
            $em->flush();

            $cashTransaction = $this->request('POST', '/api/hk-transactions', $admin, $line + [
                'unitId' => $unit->getId(),
                'sourceType' => 'employeeCash',
                'sourceId' => $cash->getId(),
            ]);
            self::assertSame(201, $cashTransaction->getStatusCode(), $cashTransaction->getContent());
            $transaction = json_decode($cashTransaction->getContent(), true, flags: JSON_THROW_ON_ERROR);
            $cashAllocation = $this->request('POST', '/api/employee-cash-ledger/'.$cash->getId().'/allocate', $admin, [
                'allocationType' => 'hk',
                'allocationId' => $transaction['id'],
                'allocationCode' => $transaction['transactionCode'],
            ]);
            self::assertSame(200, $cashAllocation->getStatusCode(), $cashAllocation->getContent());
            $cash = $em->find(\App\Entity\EmployeeCashLedger::class, $cash->getId());
            self::assertSame('Allocated', $cash->getStatus());
            self::assertSame($transaction['id'], $cash->getAllocationId());
            self::assertNull($connection->fetchOne('SELECT service_job_id FROM hktransactions WHERE id = ?', [$transaction['id']]));
            $deletePath = $allocationPath.'/'.$equipment['id'];
            self::assertSame(403, $this->request('DELETE', $deletePath, $manager, [])->getStatusCode());
            self::assertSame(404, $this->request('DELETE', self::JOBS.'/'.$second['id'].'/allocations/'.$equipment['id'], $admin, [])->getStatusCode());
            $this->json('DELETE', $deletePath, $admin, 200);
            self::assertEqualsCanonicalizing([$labour['id'], $secondEquipment['id']], array_map('intval', $connection->fetchFirstColumn(
                'SELECT id FROM hktransactions WHERE service_job_id = ?', [$created['id']]
            )));
        } finally {
            $connection->rollBack();
        }
    }

    private function createUser(EntityManagerInterface $em, string $role): User
    {
        $user = (new User())
            ->setEmail(bin2hex(random_bytes(8)).'@owners2.local')
            ->setPassword('unused-by-jwt-test')
            ->setRoles([$role]);
        $em->persist($user);
        $em->flush();

        return $user;
    }

    private function request(string $method, string $path, ?string $token, array $payload): Response
    {
        $server = ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'];
        if ($token !== null) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        }

        $request = Request::create($path, $method, [], [], [], $server, json_encode($payload));
        $response = self::$kernel->handle($request);
        self::$kernel->terminate($request, $response);

        return $response;
    }

    private function json(string $method, string $path, string $token, int $status, array $payload = []): array
    {
        $response = $this->request($method, $path, $token, $payload);
        self::assertSame($status, $response->getStatusCode(), $response->getContent());
        $data = json_decode($response->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertTrue($data['ok']);

        return $data;
    }
}
