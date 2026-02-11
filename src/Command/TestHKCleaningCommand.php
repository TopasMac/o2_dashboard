<?php

namespace App\Command;

use App\Entity\HKCleanings;
use App\Service\HKCleaningManager;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:test:hk-cleaning',
    description: 'Test creating hktransactions from a done HK cleaning'
)]
class TestHKCleaningCommand extends Command
{
    public function __construct(
        private EntityManagerInterface $em,
        private HKCleaningManager $hkManager
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('id', InputArgument::REQUIRED, 'hk_cleanings.id to test');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $id = (int) $input->getArgument('id');

        /** @var HKCleanings|null $hk */
        $hk = $this->em->getRepository(HKCleanings::class)->find($id);

        if (!$hk) {
            $output->writeln("<error>HKCleaning #{$id} not found</error>");
            return Command::FAILURE;
        }

        $output->writeln("Testing HKCleaning #{$id}");
        $output->writeln("  Status before: {$hk->getStatus()}");

        try {
            $result = $this->hkManager->markDoneAndCreateTransaction($hk);
            $this->em->flush();

            $output->writeln("<info>✔ Transaction created / verified</info>");
            $output->writeln(json_encode($result, JSON_PRETTY_PRINT));
        } catch (\Throwable $e) {
            $output->writeln("<error>❌ Error:</error>");
            $output->writeln($e->getMessage());
            return Command::FAILURE;
        }

        return Command::SUCCESS;
    }
}