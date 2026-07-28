# Endpoint de upload de avaliações diagnósticas

## Como usar

1. Instale as dependências:
   `npm install`
2. Inicie o servidor:
   `npm start`
3. Faça um upload do arquivo Excel via:
   `POST /api/turmas/:id/diagnosticas`

### Exemplo com curl

```bash
curl -X POST http://localhost:3000/api/turmas/123/diagnosticas \
  -F "file=@caminho/arquivo.xlsx" \
  -F "dataAvaliacao=2026-07-28"
```
