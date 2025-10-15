import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('✅ Street Aces Bot est en ligne et actif 24/7 sur Render !');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌍 Serveur Keep-Alive actif sur le port ${PORT}`);
});

export default app;
 