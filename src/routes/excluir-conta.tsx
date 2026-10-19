import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/site-info";

export const Route = createFileRoute("/excluir-conta")({
  head: () => ({ meta: [{ title: `Excluir conta · ${APP_NAME}` }] }),
  component: ExcluirConta,
});

function ExcluirConta() {
  const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Excluir minha conta")}`;
  return (
    <LegalPage title="Excluir sua conta">
      <p>
        Para excluir sua conta da {APP_NAME} e os dados ligados a ela, envie um e-mail para{" "}
        <a className="underline" href={mail}>
          {SUPPORT_EMAIL}
        </a>{" "}
        com o assunto <b>"Excluir minha conta"</b>, a partir do e-mail usado no login.
      </p>
      <h2>O que é apagado</h2>
      <ul>
        <li>Conta e login.</li>
        <li>Configurações do agente e conexão com o WhatsApp.</li>
        <li>Conversas, resumos, lista de contatos, agenda e reservas.</li>
      </ul>
      <p>A exclusão é feita em até 30 dias, e a assinatura é cancelada na mesma hora.</p>
      <h2>O que fica guardado</h2>
      <p>
        Registros de cobrança (faturas e pagamentos) ficam pelo prazo que a lei fiscal exige e
        depois são apagados.
      </p>
    </LegalPage>
  );
}
