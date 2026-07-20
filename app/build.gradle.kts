plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

import java.util.Properties

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use(::load)
    }
}

fun secret(name: String): String =
    localProperties.getProperty(name)
        ?: providers.environmentVariable(name).orNull
        ?: ""

android {
    namespace = "com.example.tikltsg"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.example.tikltsg"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "GOOGLE_MAPS_API_KEY", "\"${secret("GOOGLE_MAPS_API_KEY")}\"")
        buildConfigField("String", "TANKERKOENIG_API_KEY", "\"${secret("TANKERKOENIG_API_KEY")}\"")
        buildConfigField("boolean", "NDP_ENABLED", secret("NDP_ENABLED").toBoolean().toString())
        buildConfigField("String", "NDP_INGEST_ENDPOINT", "\"${secret("NDP_INGEST_ENDPOINT")}\"")
        buildConfigField("String", "NDP_INGEST_KEY", "\"${secret("NDP_INGEST_KEY")}\"")
        buildConfigField("String", "NDP_ENVIRONMENT", "\"${secret("NDP_ENVIRONMENT").ifBlank { "development" }}\"")
        buildConfigField("boolean", "NDP_LOGGING_ENABLED", "false")
    }

    buildTypes {
        debug {
            buildConfigField("boolean", "NDP_LOGGING_ENABLED", secret("NDP_LOGGING_ENABLED").ifBlank { "true" }.toBoolean().toString())
        }
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Fuel App Dependencies
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)
    implementation(libs.play.services.location)
    implementation(libs.kotlinx.coroutines.play.services)

    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
