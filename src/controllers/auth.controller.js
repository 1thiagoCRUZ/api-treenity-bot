import { z } from 'zod';
import { authService } from '../services/auth.service.js';

const REFRESH_COOKIE = 'refresh_token';

function refreshCookieOptions(expires) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        expires,
    };
}

const loginSchema = z.object({
    email: z.string().email(),
    senha: z.string().min(8),
});

const criarUsuarioSchema = z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    senha: z.string().min(8),
    // Opcional: por padrão cria como funcionario. Só quem já é admin pode
    // chamar essa rota, então dá pra escolher 'admin' explicitamente se precisar.
    papel: z.enum(['admin', 'funcionario']).default('funcionario'),
});

const ssoSchema = z.object({
    email: z.string().email(),
    nome: z.string().min(2),
});

export const authController = {
    async login(req, res) {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'E-mail ou senha em formato inválido' });
        }
        const { email, senha } = parsed.data;

        const usuario = await authService.autenticar(email, senha);
        if (!usuario) {
            return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos' });
        }

        const { accessToken, refreshToken, refreshExpiraEm } = await authService.emitirTokens(
            usuario,
            req.headers['user-agent']
        );

        res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshExpiraEm));
        res.json({
            success: true,
            data: {
                accessToken,
                usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
            },
        });
    },

    async refresh(req, res) {
        const refreshToken = req.cookies?.[REFRESH_COOKIE];
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Sessão não encontrada' });
        }

        const resultado = await authService.rotacionarRefreshToken(refreshToken, req.headers['user-agent']);
        if (!resultado) {
            res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
            return res.status(401).json({ success: false, error: 'Sessão expirada, faça login novamente' });
        }

        res.cookie(REFRESH_COOKIE, resultado.refreshToken, refreshCookieOptions(resultado.refreshExpiraEm));
        res.json({ success: true, data: { accessToken: resultado.accessToken } });
    },

    async logout(req, res) {
        const refreshToken = req.cookies?.[REFRESH_COOKIE];
        if (refreshToken) {
            await authService.revogarRefreshToken(refreshToken);
        }
        res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
        res.json({ success: true });
    },

    async me(req, res) {
        res.json({ success: true, data: req.usuario });
    },

    // Lista os usuários ativos (id/nome/papel) — qualquer autenticado pode
    // chamar, é o "diretório" pra escolher com quem iniciar uma conversa.
    async listarUsuarios(req, res) {
        const usuarios = await authService.listarUsuarios();
        res.json({ success: true, data: usuarios });
    },

    // Chamada server-to-server por um sistema já confiável (ex: backend do
    // deskcomm), autenticado por segredo compartilhado (ver requireSsoSecret
    // na rota). Não é uma requisição de navegador — por isso devolve o
    // refreshToken no corpo da resposta em vez de um cookie (um Set-Cookie
    // aqui chegaria no backend que chamou, nunca no navegador do usuário
    // final). Quem integra decide como repassar o accessToken pro frontend
    // dele; para renovar, é só chamar /api/auth/sso de novo.
    async sso(req, res) {
        const parsed = ssoSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'email e nome são obrigatórios' });
        }
        const { email, nome } = parsed.data;

        const usuario = await authService.encontrarOuCriarPorEmailSso(email, nome);
        const { accessToken, refreshToken, refreshExpiraEm } = await authService.emitirTokens(
            usuario,
            req.headers['user-agent']
        );

        res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                refreshExpiraEm,
                usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
            },
        });
    },

    // Só admins autenticados podem criar contas (ver requireRole('admin') na rota).
    // Para o primeiro admin, use o script de seed: npm run db:seed-admin
    async criarUsuario(req, res) {
        const parsed = criarUsuarioSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'Dados inválidos', detalhes: parsed.error.flatten() });
        }

        try {
            const usuario = await authService.criarUsuario(parsed.data);
            res.status(201).json({ success: true, data: usuario });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ success: false, error: 'E-mail já cadastrado' });
            }
            throw error;
        }
    },
};
