# Correção definitiva do scanner, lixeira, armazenamento e segurança

## Objetivo
Entregar uma única correção integrada: leitura local rápida e contínua, kits resolvidos pelos relacionamentos reais, aprendizado seguro a partir de correções, exclusão verificável, métricas reais e autorização no backend.

## Implementação

### 1. Scanner e resolução estrutural
- Separar captura rápida e OCR pesado: amostrar uma região útil sem destruir o frame original, manter a câmera livre e promover o primeiro resultado que passar pela validação completa.
- Evitar duas passagens completas em série: selecionar a melhor variante antes do OCR de reforço e só executar o segundo passe quando houver evidência parcial útil.
- Remover qualquer valor presumido: quantidade ausente não será `1`; SKU, composição, tamanho e quantidade precisam de evidência explícita ou ficam “Não identificado”.
- Preservar o texto bruto e métricas por etapa para localizar latência sem aumentar timeouts.
- Manter a câmera aberta durante confirmação e retornar ao próximo frame imediatamente após registrar.

### 2. Kits, cores duplicadas e aliases
- Alterar a extração para produzir candidatos de cor, em vez de eliminar nomes duplicados cedo demais.
- Resolver candidatos na ordem: SKU → composição registrada em `kit_colors` → IDs das cores → tamanho → evidências restantes.
- Testar o cadastro real: `BEGE + MARROM` deve escolher a cor “Marrom Novo” porque somente seu ID compõe o kit `BEGE + MARROM-NOVO`; a mesma regra valerá para qualquer combinação futura.
- Suportar nomes alternativos e abreviações como evidência, sem permitir que aliases substituam a validação estrutural. Se mais de uma composição continuar válida, bloquear confirmação automática e mostrar as opções reais.

### 3. Aprendizado com correções
- Criar histórico de feedback por usuário, protegido por RLS, armazenando assinatura do texto bruto, proposta original e IDs finais confirmados.
- Registrar feedback somente quando o operador altera SKU, kit/cor, tamanho ou quantidade.
- Reutilizar correções recorrentes apenas como candidatos; toda sugestão continuará obrigada a existir no catálogo atual e satisfazer composição/relacionamentos. Feedback nunca autoriza inventar ou dar baixa automática.

### 4. Lixeira e armazenamento
- Substituir count/sample/export/delete separados por uma única definição backend dos filtros, eliminando divergência entre prévia e exclusão.
- Corrigir exclusões de registros sem SKU e tratar dependências de movimentações/leituras de forma transacional, sem tocar em saldos físicos.
- Remover a sobrecarga antiga da função de limpeza e retornar: encontrados, excluídos, restantes, arquivos removidos, falhas e métricas de espaço.
- Após o DELETE, reconsultar os mesmos IDs/filtros e falhar a transação se restar qualquer registro.
- Consultar objetos reais de Storage; hoje não existem buckets/objetos, mas o fluxo ficará preparado para apagar e verificar objetos vinculados quando houver referências válidas, sem fingir contagens.
- Atualizar estatísticas após a limpeza para a interface refletir linhas vivas imediatamente; distinguir espaço lógico reutilizável de tamanho físico do banco.
- Remover a quota fixa de 5 GB da matemática exibida. Mostrar métricas verificáveis disponíveis e nunca representar zero como barra cheia.

### 5. Segurança no backend
- Revogar execução anônima de todas as funções privilegiadas e conceder somente às funções necessárias para usuários autenticados.
- Aplicar autorização por papel no backend às ações administrativas/destrutivas, preservando RLS por proprietário.
- Tornar auditoria confiável: remover inserções livres pelo navegador e impedir que a limpeza comum apague a própria trilha de auditoria.
- Tornar criação/edição de kits atômica e validar composição mínima, SKU e propriedade no banco.
- Bloquear escrita direta que contorne RPCs em estoque, alocações, plataformas e demais operações críticas; validar referências cruzadas por usuário.
- Manter CSRF, sessão e logout atuais, verificar isolamento entre usuários e acesso direto às APIs.

## Migração e preservação
- A migração será aditiva para feedback/aliases e corretiva para funções, grants, policies e validações; não altera cadastros, nomes, kits, relacionamentos ou saldos existentes.
- Nenhum teste destrutivo usará registros reais sem isolamento: serão criados marcadores controlados pertencentes ao usuário de teste e removidos no próprio teste.

## Validação obrigatória
- Testes unitários de parser/resolução: quantidade obrigatória, rejeição de lixo, duplicidade de nomes, abreviações, ambiguidade e caso real `BEGE + MARROM → BEGE + MARROM-NOVO`.
- Testes de frames derivados de uma etiqueta de regressão: normal, escura, borrada, distante, próxima e inclinada; aceitar somente resultado correto ou “não identificado”.
- Medir tempos de captura, OCR, interpretação e renderização; verificar que não há espera de backend no caminho local.
- Teste autenticado da lixeira: criar 10 registros controlados, prévia=10, excluir, nova consulta=0, recarregar e confirmar que não reaparecem; verificar objetos Storage e métricas depois.
- Testes diretos de segurança: anônimo rejeitado; usuário A não lê/altera/exclui dados de B; papel sem autorização não executa limpeza administrativa; alteração direta não contorna regras de estoque/kits.
- Rodar scanner de segurança, linter do banco e auditoria de dependências novamente após as correções.
