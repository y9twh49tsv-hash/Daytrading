import type { BotInstance } from '@daytrading/shared';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

/**
 * Server-rendered filter bar using GET params — works without client JS.
 */
export function FilterBar({
  bots,
  selectedBot,
  extraFilters,
}: {
  bots: BotInstance[];
  selectedBot?: string;
  extraFilters?: React.ReactNode;
}) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-3">
      <div className="w-full space-y-1 sm:w-56">
        <label className="text-xs text-muted-foreground" htmlFor="filter-bot">
          Bot
        </label>
        <Select id="filter-bot" name="bot" defaultValue={selectedBot ?? ''}>
          <option value="">Alle Bots</option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.name} ({bot.symbol})
            </option>
          ))}
        </Select>
      </div>
      {extraFilters}
      <Button type="submit" variant="secondary" size="sm">
        Filtern
      </Button>
    </form>
  );
}
