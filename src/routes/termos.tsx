import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { TRIAL_DAYS } from "@/lib/billing-rules";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/site-info";

export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: `Termos de uso · ${APP_NAME}` }] }),
  component: Termos,
});

function Termos() {
  return (
    <LegalPage title="Termos de uso">
      <p>Atualizados em 18 de outubro de 2026.</p>
      <p>
        Estes termos valem para quem cria uma conta na {APP_NAME}, uma atendente virtual com
        inteligência artificial que responde, no WhatsApp do negócio, às mensagens dos clientes
        desse negócio. Ao criar a conta, você concorda com eles.
      </p>

      <h2>O serviço</h2>
      <ul>
        <li>
          O agente responde com base nas instruções e informações que você cadastra. Ele não inventa
          preços nem condições; quando não sabe, chama a sua equipe.
        </li>
        <li>
          Horários pedidos pelos clientes ficam como reserva; quem confirma é a sua equipe, na tela
          Agenda.
        </li>
        <li>
          A IA pode errar. Acompanhe as conversas pela tela Conversas e assuma quando precisar:
          basta responder pelo celular.
        </li>
      </ul>

      <h2>Sua responsabilidade</h2>
      <ul>
        <li>Manter seus dados de acesso em segredo e as informações do negócio corretas.</li>
        <li>
          Usar o app só para atender quem procura o seu negócio. É proibido enviar spam, mensagens
          em massa não solicitadas ou conteúdo ilegal, e seguir as regras de uso do WhatsApp.
        </li>
        <li>
          Tratar os dados dos seus clientes conforme a Lei Geral de Proteção de Dados: pelas
          conversas e contatos, o controlador é o seu negócio.
        </li>
      </ul>

      <h2>Planos e pagamento</h2>
      <ul>
        <li>Toda conta nova tem {TRIAL_DAYS} dias de teste grátis, com limite de respostas.</li>
        <li>
          Depois, o uso é por assinatura mensal, paga pelo Asaas. O plano muda quando o pagamento é
          confirmado; sem pagamento, o agente para de responder.
        </li>
        <li>
          Você pode cancelar quando quiser na tela Planos; o agente funciona até o fim do período já
          pago. Não há reembolso de período parcial.
        </li>
      </ul>

      <h2>Limites</h2>
      <p>
        O serviço depende do WhatsApp, do provedor de IA e da internet, que podem ficar fora do ar.
        Não garantimos funcionamento sem interrupções e não respondemos por perdas causadas por
        respostas da IA, por bloqueio do número pelo WhatsApp ou por mau uso da conta.
      </p>

      <h2>Encerramento</h2>
      <p>
        Podemos suspender contas que descumpram estes termos. Você pode excluir sua conta a qualquer
        momento (veja <Link to="/excluir-conta">Excluir conta</Link>). Os dados são tratados como
        descrito na <Link to="/privacidade">Política de privacidade</Link>.
      </p>

      <h2>Contato</h2>
      <p>
        Dúvidas sobre estes termos: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        Mudanças nos termos são publicadas nesta página com a nova data.
      </p>
    </LegalPage>
  );
}
