import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/site-info";

export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: `Política de privacidade · ${APP_NAME}` }] }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <LegalPage title="Política de privacidade">
      <p>Atualizada em 17 de outubro de 2026.</p>
      <p>
        O {APP_NAME} é um atendente virtual com inteligência artificial que responde, no WhatsApp de
        cada negócio cliente, às mensagens dos clientes desse negócio. Esta política explica quais
        dados tratamos, para quê e como pedir a exclusão, conforme a Lei Geral de Proteção de Dados
        (Lei 13.709/2018).
      </p>

      <h2>Quem é responsável pelos dados</h2>
      <p>
        Pelos dados da conta (quem contrata o app), o {APP_NAME} é o controlador. Pelas conversas e
        contatos dos clientes de cada negócio, o controlador é o próprio negócio; o {APP_NAME}
        trata esses dados só para prestar o serviço contratado, como operador.
      </p>

      <h2>Dados que tratamos</h2>
      <ul>
        <li>Conta: e-mail, senha (guardada cifrada pelo provedor de login) e nome do negócio.</li>
        <li>
          Configurações do agente: instruções, horário de atendimento, agenda e reservas criadas.
        </li>
        <li>
          Conversas do WhatsApp do negócio: número, nome de perfil e o texto das mensagens (áudios
          são transcritos em texto), usados para o agente responder e para a equipe acompanhar.
        </li>
        <li>
          Lista de contatos que o negócio cadastra ou importa (nome, telefone e observações). A
          importação só acontece quando o usuário escolhe um arquivo ou contatos no celular; o app
          não lê a agenda do aparelho sozinho.
        </li>
        <li>
          Cobrança: nome ou razão social e CPF/CNPJ de quem assina, enviados ao Asaas para emitir as
          faturas. Dados de cartão são digitados no Asaas e não passam pelo app.
        </li>
      </ul>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>Supabase: banco de dados e login.</li>
        <li>Google (Gemini): gera as respostas e os resumos a partir do texto das conversas.</li>
        <li>Servidor da Evolution API: conexão com o WhatsApp do negócio.</li>
        <li>Asaas: emissão e cobrança das faturas da assinatura.</li>
      </ul>
      <p>Não vendemos dados nem usamos as conversas para publicidade.</p>

      <h2>Quanto tempo guardamos</h2>
      <p>
        Enquanto a conta existir. Ao excluir a conta, apagamos conversas, contatos, agenda e
        configurações em até 30 dias. Registros de cobrança ficam pelo prazo que a lei fiscal exige.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou exclusão dos seus dados, e saber com quem foram
        compartilhados. Clientes de um negócio devem falar primeiro com o próprio negócio; também
        atendemos pelo e-mail abaixo.
      </p>

      <h2>Segurança</h2>
      <p>
        Usamos conexão cifrada (HTTPS), acesso por senha e separação dos dados por conta. Ninguém da
        nossa equipe lê as conversas, salvo para resolver um problema a pedido do negócio.
      </p>

      <h2>Contato</h2>
      <p>
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>
    </LegalPage>
  );
}
