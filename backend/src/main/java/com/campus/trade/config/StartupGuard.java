package com.campus.trade.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 启动期配置校验。
 *
 * <p>目的：把「演示默认值被当成生产配置」这类问题挡在启动阶段，而不是等部署后被人打开
 * {@code /api/dev/**} 或拿到演示口令。原则是<b>就地报错、拒绝启动</b>，不做静默降级——
 * 静默降级会让运维误以为配置已生效。
 *
 * <p>校验项（仅当 {@code app.env=prod}，或 {@code app.env} 不是 dev 时触发）：
 * <ol>
 *   <li>开发工具必须关闭；</li>
 *   <li>演示数据初始化必须关闭；</li>
 *   <li>数据库口令不得等于仓库内公开的演示口令；</li>
 *   <li>演示管理员 / 演示学生口令不得来自仓库默认值；</li>
 * </ol>
 *
 * <p>dev 环境下只打印提示，不阻断：课程答辩需要能一键跑起来。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StartupGuard {

    /** 仓库内公开过的演示口令，出现在生产配置里即视为未收口 */
    private static final List<String> KNOWN_DEMO_SECRETS =
            List.of("Campus@2026", "Test@12345", "Admin@12345");

    private final AppProperties props;
    private final Environment environment;

    /** 在 Bean 初始化阶段校验：不通过的配置会让应用在开始对外服务之前就失败退出 */
    @PostConstruct
    public void check() {
        boolean prod = isProd();
        List<String> problems = new ArrayList<>();

        if (prod) {
            if (props.getFeatures().isEnableDevTools()) {
                problems.add("app.features.enable-dev-tools 仍为 true：生产环境必须关闭（APP_ENABLE_DEV_TOOLS=false）");
            }
            if (props.getSeed().isEnabled()) {
                problems.add("app.seed.enabled 仍为 true：生产环境必须关闭演示数据初始化（APP_SEED_ENABLED=false）");
            }
            checkNotDemoSecret(problems, "spring.datasource.password（数据库口令）",
                    environment.getProperty("spring.datasource.password"));
            checkNotDemoSecret(problems, "app.seed.admin-password", props.getSeed().getAdminPassword());
            checkNotDemoSecret(problems, "app.seed.demo-password", props.getSeed().getDemoPassword());
        } else {
            if (props.getFeatures().isEnableDevTools()) {
                log.warn("【演示模式】开发工具已开启：/api/dev/** 仍要求管理员身份，正式部署请置 APP_ENABLE_DEV_TOOLS=false");
            }
            if (props.getSeed().isEnabled()) {
                log.warn("【演示模式】演示数据初始化已开启；如口令由程序随机生成，见 {}",
                        props.getSeed().getCredentialsFile());
            }
        }

        if (!problems.isEmpty()) {
            throw new IllegalStateException("生产环境配置校验未通过：\n - " + String.join("\n - ", problems)
                    + "\n（如确为演示环境，请设 APP_ENV=dev）");
        }
    }

    private void checkNotDemoSecret(List<String> problems, String label, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (KNOWN_DEMO_SECRETS.contains(value.trim())) {
            problems.add(label + " 使用了仓库内公开的演示口令，必须改为环境变量注入的独立口令");
        }
    }

    private boolean isProd() {
        String env = props.getEnv() == null ? "dev" : props.getEnv().trim().toLowerCase(Locale.ROOT);
        return !env.isEmpty() && !"dev".equals(env) && !"test".equals(env);
    }
}
