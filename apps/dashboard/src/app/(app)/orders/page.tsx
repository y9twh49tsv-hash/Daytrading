import { getBots, getOrders } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/filter-bar';
import { OrderStatusBadge } from '@/components/status-badge';
import { formatDateTime, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string }>;
}) {
  const { bot } = await searchParams;
  const bots = await getBots();
  const orders = await getOrders(bot || undefined, 200);
  const botNames = new Map(bots.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Order-Historie</h1>

      <Card>
        <CardHeader>
          <CardTitle>Orders ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar bots={bots} selectedBot={bot} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeit</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Seite</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Menge</TableHead>
                <TableHead>Preis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Client Order ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Noch keine Orders
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{formatDateTime(order.created_at)}</TableCell>
                  <TableCell>{botNames.get(order.bot_id) ?? '–'}</TableCell>
                  <TableCell className="font-medium">{order.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={order.side === 'buy' ? 'success' : 'error'}>
                      {order.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs uppercase">{order.type}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(order.quantity)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(order.price, 4)}
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                    {order.client_order_id}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
