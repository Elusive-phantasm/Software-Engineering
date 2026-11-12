package com.campus.trade.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.Components;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI campusTradeOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("校园二手交易平台 · 接口文档")
                        .version("v1.0")
                        .description("依据《软件需求规格说明书 V2.1》实现的 REST API。认证方式：Authorization: Bearer <token>")
                        .contact(new Contact().name("软件工程课程组")))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("opaque")))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
    }
}
