// Cria o primeiro usuário admin diretamente no banco, sem passar pela API
// (não há como criar o primeiro admin via HTTP, já que POST /api/auth/usuarios
// exige um admin autenticado). Rode com:
//   npm run db:seed-admin -- "Nome Completo" email@exemplo.com senhaForte123
import { authService } from '../services/auth.service.js';

const [, , nome, email, senha] = process.argv;

if (!nome || !email || !senha) {
    console.error('Uso: npm run db:seed-admin -- "<Nome>" <email> <senha>');
    process.exit(1);
}

if (senha.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.');
    process.exit(1);
}

try {
    const usuario = await authService.criarUsuario({ nome, email, senha, papel: 'admin' });
    console.log('[Seed] Admin criado com sucesso:', usuario);
    process.exit(0);
} catch (error) {
    if (error.code === '23505') {
        console.error('[Seed] Já existe um usuário com esse e-mail.');
    } else {
        console.error('[Seed] Erro ao criar admin:', error.message);
    }
    process.exit(1);
}
