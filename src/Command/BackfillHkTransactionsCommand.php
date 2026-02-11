<?php

namespace App\Command;

use App\Entity\HKCleanings;
use App\Service\HKCleaningManager;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:hk:backfill-transactions',
    description: 'Backfill hktransactions for hk_cleanings with status=done that are missing a hktransactions row.'
)]
class BackfillHkTransactionsCommand extends Command
{
    protected static $defaultName = 'app:hk:backfill-transactions';
    protected static $defaultDescription = 'Backfill hktransactions for hk_cleanings with status=done that are missing a hktransactions row.';
    public function __construct(
        private readonly Connection $db,
        private readonly EntityManagerInterface $em,
        private readonly HKCleaningManager $hkCleaningManager,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('from', null, InputOption::VALUE_REQUIRED, 'Start date (YYYY-MM-DD) inclusive', '2026-01-01')
            ->addOption('limit', null, InputOption::VALUE_OPTIONAL, 'Max rows to process (batch size)', 500)
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Do not write anything, just show what would happen')
            ->addOption('verbose-ids', null, InputOption::VALUE_NONE, 'Print each hk_cleanings.id processed');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $from = (string) $input->getOption('from');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
            $output->writeln('<error>Invalid --from. Expected YYYY-MM-DD</error>');
            return Command::INVALID;
        }

        $limit = (int) ($input->getOption('limit') ?? 500);
        if ($limit <= 0) $limit = 500;

        $dryRun = (bool) $input->getOption('dry-run');
        $verboseIds = (bool) $input->getOption('verbose-ids');

        // Count missing first (for info)
        $missingCnt = (int) $this->db->fetchOne(
            "SELECT COUNT(*)
             FROM hk_cleanings hc
             LEFT JOIN hktransactions tx ON tx.hk_cleaning_id = hc.id
             WHERE LOWER(COALESCE(hc.status,'')) = 'done'
               AND hc.checkout_date >= :from
               AND tx.id IS NULL",
            ['from' => $from]
        );

        $output->writeln(sprintf('Missing hktransactions since %s: <info>%d</info>', $from, $missingCnt));

        if ($missingCnt === 0) {
            $output->writeln('<info>Nothing to do.</info>');
            return Command::SUCCESS;
        }

        $ids = $this->db->fetchFirstColumn(
            "SELECT hc.id
             FROM hk_cleanings hc
             LEFT JOIN hktransactions tx ON tx.hk_cleaning_id = hc.id
             WHERE LOWER(COALESCE(hc.status,'')) = 'done'
               AND hc.checkout_date >= :from
               AND tx.id IS NULL
             ORDER BY hc.checkout_date ASC, hc.id ASC
             LIMIT {$limit}",
            ['from' => $from]
        );

        $output->writeln(sprintf('Processing up to %d rows%s...', count($ids), $dryRun ? ' (dry-run)' : ''));

        $created = 0;
        $skipped = 0;
        $errors  = 0;

        foreach ($ids as $idRaw) {
            $id = (int) $idRaw;
            if ($id <= 0) continue;

            if ($verboseIds) {
                $output->writeln(sprintf(' - hk_cleanings.id=%d', $id));
            }

            /** @var HKCleanings|null $hk */
            $hk = $this->em->getRepository(HKCleanings::class)->find($id);
            if (!$hk) {
                $errors++;
                $output->writeln(sprintf('<error>Not found: hk_cleanings.id=%d</error>', $id));
                continue;
            }

            if ($dryRun) {
                // Just simulate “would create” (we already filtered to missing rows)
                $created++;
                // Keep memory low in long runs
                $this->em->detach($hk);
                continue;
            }

            try {
                // This method is already idempotent; but we filtered missing ones anyway.
                $info = $this->hkCleaningManager->markDoneAndCreateTransaction($hk);
                if (!empty($info['alreadyExisted'])) {
                    $skipped++;
                } else {
                    $created++;
                }
            } catch (\Throwable $e) {
                $errors++;
                $output->writeln(sprintf(
                    '<error>Failed hk_cleanings.id=%d: %s</error>',
                    $id,
                    $e->getMessage()
                ));
            } finally {
                // Important to avoid memory blowups in big batches
                $this->em->clear();
            }
        }

        $output->writeln('');
        $output->writeln(sprintf('<info>Done.</info> created=%d skipped=%d errors=%d', $created, $skipped, $errors));

        // Show remaining missing after this batch (only if not dry-run)
        if (!$dryRun) {
            $remaining = (int) $this->db->fetchOne(
                "SELECT COUNT(*)
                 FROM hk_cleanings hc
                 LEFT JOIN hktransactions tx ON tx.hk_cleaning_id = hc.id
                 WHERE LOWER(COALESCE(hc.status,'')) = 'done'
                   AND hc.checkout_date >= :from
                   AND tx.id IS NULL",
                ['from' => $from]
            );
            $output->writeln(sprintf('Remaining missing since %s: <info>%d</info>', $from, $remaining));
        }

        return $errors > 0 ? Command::FAILURE : Command::SUCCESS;
    }
}