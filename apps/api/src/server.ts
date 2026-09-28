import { app } from './app';

app.listen(Number(process.env.PORT ?? 3000));
console.log('CapyBudget API listening at ' + app.server?.url);
