plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "us.siqa.box"
    compileSdk = 34

    defaultConfig {
        applicationId = "us.siqa.box"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        buildConfigField("String", "SITE", "\"https://www.siqa.us\"")
        buildConfigField("String", "SUPABASE_URL", "\"https://eixlmylbqqrfazjlgxcz.supabase.co\"")
        buildConfigField("String", "SUPABASE_KEY", "\"sb_publishable_hGOrpdHS1fwFYwXGI8tN2g_Yeuzchmj\"")
    }

    signingConfigs {
        create("release") {
            // CI signs with a keystore from secrets when present; otherwise the debug key is used.
            val ks = System.getenv("SIQA_BOX_KEYSTORE")
            if (ks != null && file(ks).exists()) {
                storeFile = file(ks)
                storePassword = System.getenv("SIQA_BOX_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("SIQA_BOX_KEY_ALIAS")
                keyPassword = System.getenv("SIQA_BOX_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (System.getenv("SIQA_BOX_KEYSTORE") != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.google.zxing:core:3.5.3")
}
