from django.contrib.postgres.indexes import GistIndex
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations, models


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("carbon_tracker", "0004_vietnamoco2data"),
    ]

    operations = [
        AddIndexConcurrently(
            model_name="vietnamoco2data",
            index=GistIndex(fields=["location"], name="vn_oco2_location_gix"),
        ),
        AddIndexConcurrently(
            model_name="vietnamoco2data",
            index=models.Index(
                fields=["xco2_quality_flag"], name="vn_oco2_quality_idx"
            ),
        ),
        AddIndexConcurrently(
            model_name="vietnamoco2data",
            index=models.Index(fields=["operation_mode"], name="vn_oco2_mode_idx"),
        ),
        migrations.AlterModelOptions(
            name="vietnamoco2data",
            options={
                "ordering": ("-acquisition_time", "-sounding_id"),
                "indexes": [
                    GistIndex(fields=["location"], name="vn_oco2_location_gix"),
                    models.Index(
                        fields=["xco2_quality_flag"], name="vn_oco2_quality_idx"
                    ),
                    models.Index(fields=["operation_mode"], name="vn_oco2_mode_idx"),
                ],
            },
        ),
    ]
