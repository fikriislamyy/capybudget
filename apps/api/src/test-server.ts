import { app } from './app';

app.listen(Number(process.env.PORT ?? 3000));
console.log('CapyBudget test API listening at ' + app.server?.url);
